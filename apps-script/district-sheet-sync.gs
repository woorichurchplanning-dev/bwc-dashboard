/**
 * 「교구 출석 현황표」 자동 연동
 *
 * 교구 담당자들이 매주 채우는 별도 시트를 그대로 읽어, 대시보드가 쓰는
 * 주차(weekKey) 구조로 바꿔 준다. 입력앱에 다시 옮겨 적을 필요가 없다.
 *
 * ── 설치 ──────────────────────────────────────────────
 * 1) 기존 BWC Apps Script 프로젝트에 이 파일을 추가한다.
 * 2) 기존 doGet 안에서, 시트에서 읽은 result 를 만든 뒤 아래 한 줄을 넣는다.
 *
 *      mergeDistrictSheet(result, weekKeys);
 *
 *    (result 는 { '2026-08-30': { '주일예배': {...}, ... }, ... } 형태의 객체)
 * 3) 저장 후 웹앱을 새 버전으로 재배포한다.
 *
 * ※ 이 스크립트를 실행하는 계정이 아래 시트를 열 수 있어야 한다.
 *    (소유자와 다르면 편집자 또는 뷰어로 공유해 둘 것)
 */

var DISTRICT_SHEET_ID = '1SfBiHXb8859W9vi1PpW8bViF1i-F1D50jHxFo9vrahc';

/** 표마다 제목 · 대상 그룹 · 읽는 방식이 다르다 */
var DISTRICT_SECTIONS = [
  { title: '다락방 출석 현황',   group: '교구 다락방', byKind: true  },  // 구분(여다락방 등)별
  { title: '화요순장반 출석 현황', group: '화요순장반',  byKind: false },  // 교구당 한 값
  { title: '직장순장반 출석 현황', group: '직장순장반',  byKind: false },
];

/** 다락방 '구분' 표기 흔들림을 대시보드가 쓰는 이름으로 맞춘다 */
var KIND_ALIAS = {
  '여다락방': '여다락방',
  '여직장다락방': '여직장다락방',
  '남다락방': '남다락방',
  '부부다락방': '부부다락방',
  '시니어 여': '시니어', '시니어여': '시니어',
  '시니어 남': '시니어', '시니어남': '시니어',
  '시니어': '시니어',
};

/** 그 날짜가 속한 주의 일요일 (대시보드 weekKey 규칙과 동일) */
function districtSundayOf_(d) {
  var dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var add = dt.getDay() === 0 ? 0 : 7 - dt.getDay();
  dt.setDate(dt.getDate() + add);
  return Utilities.formatDate(dt, 'Asia/Seoul', 'yyyy-MM-dd');
}

function districtNorm_(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

/**
 * result 에 교구 자료를 채워 넣는다.
 * weekKeys 를 주면 그 주차만, 안 주면 시트에 있는 모든 주차를 담는다.
 */
function mergeDistrictSheet(result, weekKeys) {
  var want = null;
  if (weekKeys && weekKeys.length) {
    want = {};
    for (var i = 0; i < weekKeys.length; i++) want[weekKeys[i]] = true;
  }

  var rows;
  try {
    rows = SpreadsheetApp.openById(DISTRICT_SHEET_ID).getSheets()[0].getDataRange().getValues();
  } catch (e) {
    // 시트를 못 열어도 나머지 응답은 그대로 나가야 한다
    Logger.log('교구 시트 열기 실패: ' + e.message);
    return result;
  }

  for (var s = 0; s < DISTRICT_SECTIONS.length; s++) {
    var sec = DISTRICT_SECTIONS[s];

    // 1) 표 제목 줄 찾기
    var titleRow = -1;
    for (var r = 0; r < rows.length; r++) {
      if (districtNorm_(rows[r][0]).indexOf(sec.title) >= 0) { titleRow = r; break; }
    }
    if (titleRow < 0) continue;

    // 2) 바로 아래가 헤더( 교구 | 구분 | 날짜… )
    var head = rows[titleRow + 1];
    if (!head) continue;
    var dateCols = [];
    for (var c = 2; c < head.length; c++) {
      var cell = head[c];
      if (cell instanceof Date) {
        dateCols.push({ col: c, week: districtSundayOf_(cell) });
      } else {
        // '9/25(휴강)' 같은 문자열도 날짜로 받아 준다
        var m = districtNorm_(cell).match(/^(\d{1,2})\s*[\/\.]\s*(\d{1,2})/);
        if (m) {
          var y = new Date().getFullYear();
          dateCols.push({ col: c, week: districtSundayOf_(new Date(y, Number(m[1]) - 1, Number(m[2]))) });
        }
      }
    }
    if (!dateCols.length) continue;

    // 3) 데이터 줄 읽기 — 다음 표 제목이나 빈 구간을 만나면 멈춘다
    var lastDistrict = '';
    for (var r2 = titleRow + 2; r2 < rows.length; r2++) {
      var a = districtNorm_(rows[r2][0]);
      var b = districtNorm_(rows[r2][1]);
      if (/출석 현황/.test(a)) break;                    // 다음 표
      if (!a && !b) continue;                            // 빈 줄
      if (a) lastDistrict = a;
      var district = lastDistrict;
      if (!/^\d+교구$/.test(district)) continue;         // 소계·총계 등 제외
      if (sec.byKind && /소계|합계/.test(b)) continue;

      var field = sec.byKind ? KIND_ALIAS[b] : '인원';
      if (!field) continue;

      for (var d = 0; d < dateCols.length; d++) {
        var wk = dateCols[d].week;
        if (want && !want[wk]) continue;
        var raw = rows[r2][dateCols[d].col];
        if (raw === '' || raw == null) continue;
        if (/휴강/.test(String(raw))) continue;          // 휴강은 0과 다르다 — 비워 둔다
        var n = Number(String(raw).replace(/,/g, ''));
        if (isNaN(n)) continue;

        if (!result[wk]) result[wk] = {};
        if (!result[wk][sec.group]) result[wk][sec.group] = {};
        if (!result[wk][sec.group][district]) result[wk][sec.group][district] = {};
        var cur = result[wk][sec.group][district][field] || 0;
        // 시니어 남/여처럼 여러 줄이 한 항목으로 합쳐지는 경우가 있다
        result[wk][sec.group][district][field] = cur + n;
      }
    }
  }
  return result;
}

/** 설치 확인용 — 실행하면 최근 주차 몇 개를 로그로 보여준다 */
function testDistrictSheet() {
  var out = mergeDistrictSheet({}, null);
  var weeks = Object.keys(out).sort();
  Logger.log('읽은 주차: ' + weeks.length + '개 · ' + weeks.slice(-4).join(', '));
  var last = weeks[weeks.length - 1];
  Logger.log(last + ' → ' + JSON.stringify(out[last]));
}
