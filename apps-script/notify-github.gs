/**
 * 시트 수정 시 GitHub 워크플로(refresh-data.yml)를 트리거해서
 * data.json을 자동 갱신한다. (Apps Script 프로젝트에 이 코드를 추가)
 *
 * 설치 순서는 apps-script/README.md 참고.
 *
 * 동작:
 *  - 시트를 편집하면 onSheetEdit가 호출됨(설치형 트리거).
 *  - 연속 편집(버스트)을 합치려고, 편집할 때마다 90초 뒤 1회 실행되는
 *    예약 트리거로 debounce → 마지막 편집 90초 후 dispatchRefresh가 1번만 실행.
 *  - dispatchRefresh가 GitHub repository_dispatch(event_type: sheet-updated)를
 *    호출 → 워크플로가 data.json을 재생성/커밋 → GitHub Pages 재배포.
 */

var GH_OWNER = 'woorichurchplanning-dev';
var GH_REPO  = 'bwc-dashboard';
var DISPATCH_EVENT = 'sheet-updated';
var DEBOUNCE_SECONDS = 90;

// 편집 시 호출(설치형 onEdit 트리거). 90초 debounce 예약.
function onSheetEdit(e) {
  // 기존 예약(dispatchRefresh) 트리거 제거 후 새로 예약 → 마지막 편집 기준으로 미룸
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dispatchRefresh') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('dispatchRefresh').timeBased().after(DEBOUNCE_SECONDS * 1000).create();
}

// 실제 GitHub 트리거 발사(예약 트리거가 호출). 자기 자신 정리 후 dispatch.
function dispatchRefresh() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'dispatchRefresh') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  var token = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
  if (!token) { console.error('스크립트 속성 GH_TOKEN 미설정'); return; }

  var url = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/dispatches';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ event_type: DISPATCH_EVENT }),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 204) console.error('GitHub dispatch 실패 ' + code + ': ' + res.getContentText());
  else console.log('GitHub 워크플로 트리거 성공');
}

// ── 최초 1회만 실행: 설치형 onEdit 트리거 생성 ──
// (컨테이너 바인드 스크립트면 그대로 실행. 스탠드얼론이면 SHEET_ID 채우기)
var SHEET_ID = ''; // 비워두면 활성 스프레드시트 사용

function installTriggers() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('스프레드시트를 찾을 수 없음 — SHEET_ID를 채워주세요.');
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onSheetEdit') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  console.log('설치형 onEdit 트리거 생성 완료');
}

// 연결 테스트용: 수동 실행하면 즉시 GitHub 트리거 발사
function testDispatch() { dispatchRefresh(); }
