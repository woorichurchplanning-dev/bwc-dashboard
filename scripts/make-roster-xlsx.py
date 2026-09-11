#!/usr/bin/env python3
"""교역자 연락처(Google 주소록 내보내기) → 대시보드 계정·권한 체크표(xlsx).

  python3 scripts/make-roster-xlsx.py "<연락처.csv>" "<만들 파일.xlsx>"

주소록의 라벨(교구사역자/주일학교/청년교구/기획팀)로 권한 초안을 잡는다.
라벨에는 '몇 교구', '무슨 부서'까지는 없으므로 담당 범위 칸은 비워 두고
사람이 채우게 한다. 비워 두면 그 탭 전체가 보인다.
"""
import csv, re, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

# 대시보드를 직접 굴리는 사람 — 처음 한 명은 관리자로 두어야 나머지에게 권한을 줄 수 있다
ADMINS = {'김영환', '지원일'}

# 주소록에 없거나 틀린 연락처를 여기서 메운다
PHONE_FIXES = {'신용헌': '010-2857-9658', '박세흠': '010-3283-8229'}

# 주소록 라벨만으로는 담당을 알 수 없는 사람
EXTRA_TABS = {'이동선': ['home','sunday','wd','special']}   # 예배담당

# 직책별로 더 얹는 것 (주간현황은 공통이 아니라 여기서 준다)
AREA_OF = {'교구사역자': 'district', '주일학교': 'school', '교육전도사': 'school', '청년교구': 'youth'}
def duty_area(groups):
    for g in ('교구사역자', '청년교구', '주일학교', '교육전도사'):
        if g in groups: return g
    return None

DUTY_TABS = {
    '안내부': ['home','sunday','wd','newfam'],
    '주차':   ['home','sunday','wd','newfam'],
    '디렉터': ['home','sunday','wd','newfam','special','yearcomp'],
}

# 주소록에 없는 실제 직책. 라벨에는 교구사역자/주일학교 정도만 있어서
# 안내부·주차·디렉터 같은 것은 여기 적어 둔다.
DUTIES = {
    '고두빈': '안내부', '김성민': '안내부',
    '남세권': '주차',   '구귀현': '주차',
    '은주성': '디렉터', '박기범': '디렉터', '이진환': '디렉터',
    '오경제': '행정목사', '한승우': '기획팀장',
    '김영환': '기획팀',  '지원일': '기획팀',
    '이동선': '예배담당',
}

# 전체를 보는 사람 — 행정목사·기획팀장·기획팀
FULL_ACCESS = {'오경제', '한승우', '김영환', '지원일', '이승지'}

# 교역자 주소록에 없는 사람 (사무직 등)
EXTRA_PEOPLE = [
    {'name': '이승지', 'title': '사무장', 'duty': '사무장',
     'phone': '010-3204-4464', 'groups': [], 'tabs': set()},
]

TABS = [('sunday','주일예배'), ('youth','청년교구'), ('school','주일학교'),
        ('wd','주중예배'), ('district','장년교구'), ('newfam','새가족'),
        ('special','특별예배'), ('yearcomp','연도별비교')]

# 주소록 라벨 → 기본으로 열어 줄 탭
BY_GROUP = {
    '교구사역자': ['district', 'newfam'],
    '주일학교':   ['school'],
    '교육전도사': ['school'],
    '청년교구':   ['youth', 'newfam'],
    '기획팀':     [k for k,_ in TABS],          # 기획팀은 전체를 본다
}

def main(src, dst):
    rows = list(csv.DictReader(open(src, encoding='utf-8')))
    people = []
    for r in rows:
        name = (r['Family Name'] or '') + (r['Given Name'] or '')
        if not name:
            continue
        # 동명이인은 주소록 이름의 괄호로 구분한다 (예: 김정은전도사(영아부))
        note = (re.search(r'\((.+?)\)', r['Name'] or '') or [None, ''])[1]
        groups = {t.strip() for t in (r['Group Membership'] or '').split(':::')}
        groups = {g for g in groups if g and not g.startswith('*')}
        raw_phone = PHONE_FIXES.get(name) or r['Phone 1 - Value'] or ''
        phone = re.sub(r'\D', '', raw_phone)
        tabs = set()
        for g in groups:
            tabs.update(BY_GROUP.get(g, []))
        # 직책 규칙이 있으면 주소록 라벨로 잡은 것을 대신한다
        duty = DUTIES.get(name, '')
        if duty in DUTY_TABS:
            tabs = set(DUTY_TABS[duty]) | ({AREA_OF.get(duty_area(groups))} - {None} if duty == '디렉터' else set())
        tabs.update(EXTRA_TABS.get(name, []))
        if name in FULL_ACCESS:
            tabs = {k for k, _ in TABS} | {'home'}
        people.append({
            'id': name + (note or ''),
            'name': name,
            'title': r['Name Suffix'] or '',
            'phone': raw_phone,
            'pw': phone[-4:] if len(phone) >= 4 else '',
            'groups': sorted(groups - {'전체교역자','하프사역자이상','남자전임',
                                       '교구남자전임','교구여자전임'}),
            'tabs': tabs,
            'school': note if note else '',
            'admin': name in ADMINS,
            'duty': DUTIES.get(name, ''),
        })

    for x in EXTRA_PEOPLE:
        xt = {k for k, _ in TABS} | {'home'} if x['name'] in FULL_ACCESS else set(x['tabs'])
        people.append({
            'id': x['name'], 'name': x['name'], 'title': x['title'], 'phone': x['phone'],
            'pw': re.sub(r'\D', '', x['phone'])[-4:], 'groups': x['groups'],
            'tabs': xt, 'school': '',
            'admin': x['name'] in ADMINS, 'duty': x['duty'],
        })

    wb = Workbook()
    ws = wb.active
    ws.title = '계정'

    head = ['아이디','이름','직분','직책','연락처','초기비밀번호','관리자','주간현황'] + \
           [label for _, label in TABS] + \
           ['주일학교 담당부서','담당 청년부','담당 팀','담당 교구','주소록 라벨']
    ws.append(head)

    hdr_fill = PatternFill('solid', fgColor='1F3A5F')
    tab_fill = PatternFill('solid', fgColor='2E6F8E')
    scope_fill = PatternFill('solid', fgColor='6B7280')
    thin = Side(style='thin', color='D0D5DD')
    for i, _ in enumerate(head, 1):
        c = ws.cell(row=1, column=i)
        c.font = Font(bold=True, color='FFFFFF', size=10)
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.fill = tab_fill if 9 <= i <= 8 + len(TABS) else \
                 (scope_fill if i > 8 + len(TABS) else hdr_fill)
        c.border = Border(bottom=thin)

    for p in sorted(people, key=lambda x: (not x['groups'], x['groups'], x['name'])):
        ws.append([
            p['id'], p['name'], p['title'], p['duty'], p['phone'], p['pw'],
            'O' if p['admin'] else '', 'O' if ('home' in p['tabs'] or p['admin']) else '',
            *['O' if k in p['tabs'] else '' for k, _ in TABS],
            p['school'], '', '', '', ' / '.join(p['groups']),
        ])

    # 손볼 데가 있는 줄은 눈에 띄게 — 연락처가 없어 비밀번호가 비었거나,
    # 주소록에 담당 라벨이 없어 주간현황만 열린 사람
    warn = PatternFill('solid', fgColor='FFF3CD')
    for row in range(2, ws.max_row + 1):
        if not ws.cell(row=row, column=6).value or not ws.cell(row=row, column=len(head)).value:
            for col in range(1, len(head) + 1):
                ws.cell(row=row, column=col).fill = warn

    last = ws.max_row
    dv = DataValidation(type='list', formula1='"O"', allow_blank=True)
    ws.add_data_validation(dv)
    for col in range(7, 9 + len(TABS)):          # 관리자 · 주간현황 + 탭 칸
        dv.add(f'{get_column_letter(col)}2:{get_column_letter(col)}{last}')
        for row in range(2, last + 1):
            ws.cell(row=row, column=col).alignment = Alignment(horizontal='center')

    widths = [14, 9, 7, 10, 15, 12, 8, 10] + [10] * len(TABS) + [20, 14, 16, 14, 26]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = 'C2'

    ws2 = wb.create_sheet('읽는 법')
    for line in [
        ['대시보드 계정·권한 체크표'], [],
        ['아이디', '교역자 이름. 동명이인만 뒤에 담당을 붙였습니다.'],
        ['초기비밀번호', '휴대폰 뒷 4자리. 첫 로그인에서 본인이 바꾸게 되어 있습니다.'],
        ['직책', '주소록에 없는 실제 담당(안내부·주차·디렉터·기획팀 등)입니다.'],
        ['주간현황', '교회 전체 숫자입니다. 담당 부서만 보는 분은 비워 둡니다.'],
        ['관리자', 'O 를 넣으면 모든 탭이 열리고, 다른 사람 권한도 줄 수 있습니다.'],
        ['노란 줄', '연락처가 없어 비밀번호가 비었거나, 담당 라벨이 없어 주간현황만'],
        ['', '열린 사람입니다. 채워 주셔야 계정이 만들어집니다.'],
        [], ['탭 칸 (주일예배 ~ 연도비교)'],
        ['', 'O = 그 탭을 볼 수 있음. 비우면 안 보입니다.'],
        [], ['담당 범위 칸 (오른쪽 네 칸)'],
        ['', '비워 두면 그 탭 안의 전체가 보입니다.'],
        ['', '적으면 적은 것만 보입니다. 둘 이상은 / 로 나눕니다.'],
        ['주일학교 담당부서', '사랑부 영아부 유아부 유치부 송림유년 서현유년 송림초등 서현초등'],
        ['', '송림소년 서현소년 송림청소년부 중등부 고등부'],
        ['담당 청년부', '1청년부 2청년부 3청년부 4청년부'],
        ['담당 팀', '예: 1청년부 2팀 / 1청년부 3팀'],
        ['담당 교구', '1교구 ~ 14교구'],
        [], ['다 채우신 뒤'],
        ['', '1) 이 파일을 그대로 두고'],
        ['', '2) bash scripts/apply-roster.sh "<이 파일 경로>"'],
        ['', '   먼저 미리보기가 나오고, 확인 후 --apply 로 반영합니다.'],
    ]:
        ws2.append(line)
    ws2.column_dimensions['A'].width = 20
    ws2.column_dimensions['B'].width = 78
    ws2['A1'].font = Font(bold=True, size=13)
    for r in range(1, ws2.max_row + 1):
        ws2.cell(row=r, column=1).font = Font(bold=True, size=10)

    wb.save(dst)
    n_pw = sum(1 for p in people if not p['pw'])
    print(f'{dst}  —  {len(people)}명' + (f' (연락처 없어 비밀번호 빈 칸: {n_pw}명)' if n_pw else ''))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
