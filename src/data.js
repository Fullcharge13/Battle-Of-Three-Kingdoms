// ===== 삼국쟁투 데이터 표 =====
// 능력치·적성은 정사(진수 『삼국지』)와 연의(나관중 『삼국지연의』)의 활약을 근거로 이 프로젝트에서 새로 정한 값이다.
// 생몰년은 정사 기준이며, 확실하지 않은 출생년은 추정(근사)이다.

var REGIONS = {
  xiliang: { name: '서량', bias: { inf: 0, arc: 0, cav: 2 } },
  guanzhong: { name: '관중', bias: { inf: 1, arc: 0, cav: 1 } },
  hebei: { name: '하북', bias: { inf: 1, arc: 0, cav: 1 } },
  zhongyuan: { name: '중원', bias: { inf: 2, arc: 0, cav: 0 } },
  jing: { name: '형주', bias: { inf: 0, arc: 2, cav: 0 } },
  jiangdong: { name: '강동', bias: { inf: 1, arc: 1, cav: 0 } },
  xu: { name: '서주', bias: { inf: 1, arc: 1, cav: 0 } },
};

// id, 이름, 지역, x, y, 인접, 인구, 농업, 상업, 성벽(최대), 병력
var CITIES = [
  ['wuwei', '무위', 'xiliang', 90, 170, ['changan'], 150000, 300, 250, 2000, 18000],
  ['changan', '장안', 'guanzhong', 250, 310, ['wuwei', 'luoyang', 'wan'], 400000, 600, 700, 4000, 40000],
  ['luoyang', '낙양', 'zhongyuan', 450, 290, ['changan', 'ye', 'chenliu', 'xuchang', 'wan'], 120000, 250, 250, 2500, 25000],
  ['ye', '업', 'hebei', 560, 160, ['luoyang', 'nanpi', 'puyang'], 350000, 600, 600, 3500, 35000],
  ['nanpi', '남피', 'hebei', 700, 115, ['ye', 'beiping', 'pingyuan'], 200000, 450, 400, 2500, 20000],
  ['beiping', '북평', 'hebei', 800, 40, ['nanpi'], 150000, 350, 300, 2500, 25000],
  ['pingyuan', '평원', 'hebei', 790, 210, ['nanpi', 'puyang', 'xiapi'], 150000, 400, 300, 1800, 12000],
  ['chenliu', '진류', 'zhongyuan', 580, 305, ['luoyang', 'puyang', 'xuchang'], 220000, 500, 450, 2500, 18000],
  ['puyang', '복양', 'zhongyuan', 660, 245, ['ye', 'pingyuan', 'chenliu', 'xiapi'], 180000, 450, 400, 2200, 12000],
  ['xuchang', '허창', 'zhongyuan', 540, 380, ['luoyang', 'chenliu', 'wan', 'runan'], 150000, 500, 400, 1500, 3000],
  ['wan', '완', 'jing', 430, 430, ['changan', 'luoyang', 'xuchang', 'xiangyang'], 300000, 550, 550, 3000, 30000],
  ['runan', '여남', 'zhongyuan', 610, 460, ['xuchang', 'xiapi'], 250000, 500, 450, 2200, 18000],
  ['xiangyang', '양양', 'jing', 420, 545, ['wan', 'changsha'], 300000, 600, 600, 4000, 30000],
  ['changsha', '장사', 'jing', 470, 665, ['xiangyang'], 180000, 450, 350, 2200, 20000],
  ['xiapi', '하비', 'xu', 770, 390, ['pingyuan', 'puyang', 'runan'], 250000, 500, 500, 3200, 22000],
].map(r => ({ id: r[0], name: r[1], region: r[2], x: r[3], y: r[4], adj: r[5], pop: r[6], agri: r[7], comm: r[8], wallMax: r[9], troops: r[10] }));

var FACTIONS = [
  { id: 'cao', name: '조조', ruler: 'caocao', color: '#3b6fd6' },
  { id: 'yuan', name: '원소', ruler: 'yuanshao', color: '#d6a53b' },
  { id: 'dong', name: '동탁', ruler: 'dongzhuo', color: '#7a3bd6' },
  { id: 'gongsun', name: '공손찬', ruler: 'gongsunzan', color: '#e8e8e8' },
  { id: 'yuanshu', name: '원술', ruler: 'yuanshu', color: '#c9c93a' },
  { id: 'liu', name: '유표', ruler: 'liubiao', color: '#3ba86a' },
  { id: 'sun', name: '손견', ruler: 'sunjian', color: '#d63b3b' },
  { id: 'tao', name: '도겸', ruler: 'taoqian', color: '#3bb8c9' },
  { id: 'ma', name: '마등', ruler: 'mateng', color: '#a8673b' },
];

// id, 이름, 세력, 도시, 출생, 사망, 통솔, 무력, 지력, 정치, 보, 궁, 기, 부모, 등장년
var GENERALS = [
  // 동탁
  ['dongzhuo', '동탁', 'dong', 'changan', 139, 192, 85, 80, 60, 30, 'B', 'B', 'A'],
  ['lubu', '여포', 'dong', 'luoyang', 161, 198, 92, 100, 30, 15, 'B', 'B', 'S'],
  ['zhangliao', '장료', 'dong', 'luoyang', 169, 222, 90, 90, 78, 55, 'A', 'B', 'S'],
  ['huaxiong', '화웅', 'dong', 'luoyang', 150, 192, 75, 88, 30, 20, 'A', 'C', 'A'],
  ['xurong', '서영', 'dong', 'luoyang', 150, 192, 75, 72, 55, 40, 'A', 'B', 'A'],
  ['lijue', '이각', 'dong', 'changan', 150, 198, 70, 72, 30, 20, 'B', 'B', 'A'],
  ['guosi', '곽사', 'dong', 'changan', 150, 197, 68, 70, 25, 15, 'B', 'B', 'A'],
  ['jiaxu', '가후', 'dong', 'changan', 147, 223, 75, 40, 97, 80, 'B', 'B', 'B'],
  ['liru', '이유', 'dong', 'changan', 150, 192, 50, 30, 88, 70, 'C', 'C', 'C'],
  // 원소
  ['yuanshao', '원소', 'yuan', 'ye', 154, 202, 85, 70, 72, 75, 'A', 'A', 'B'],
  ['yanliang', '안량', 'yuan', 'ye', 160, 200, 80, 92, 30, 30, 'A', 'C', 'A'],
  ['wenchou', '문추', 'yuan', 'nanpi', 160, 200, 78, 92, 25, 25, 'B', 'C', 'A'],
  ['tianfeng', '전풍', 'yuan', 'ye', 150, 200, 60, 30, 92, 80, 'C', 'B', 'C'],
  ['jushou', '저수', 'yuan', 'ye', 155, 200, 80, 40, 90, 75, 'A', 'A', 'B'],
  ['zhanghe', '장합', 'yuan', 'nanpi', 167, 231, 88, 87, 65, 50, 'A', 'B', 'A'],
  ['gaolan', '고람', 'yuan', 'nanpi', 165, 204, 75, 76, 40, 35, 'A', 'B', 'B'],
  ['shenpei', '심배', 'yuan', 'ye', 155, 204, 75, 45, 78, 70, 'A', 'A', 'C'],
  ['yuantan', '원담', 'yuan', 'ye', 173, 205, 65, 70, 40, 40, 'B', 'B', 'B', 'yuanshao'],
  // 공손찬
  ['gongsunzan', '공손찬', 'gongsun', 'beiping', 152, 199, 85, 85, 40, 35, 'B', 'C', 'S'],
  ['zhaoyun', '조운', 'gongsun', 'beiping', 168, 229, 88, 95, 75, 60, 'A', 'B', 'S'],
  ['tianyu', '전예', 'gongsun', 'beiping', 171, 252, 82, 65, 80, 75, 'A', 'A', 'A'],
  ['yanguang', '엄강', 'gongsun', 'beiping', 160, 192, 65, 65, 30, 30, 'B', 'B', 'A'],
  ['liubei', '유비', 'gongsun', 'pingyuan', 161, 223, 80, 75, 75, 80, 'A', 'B', 'A'],
  ['guanyu', '관우', 'gongsun', 'pingyuan', 160, 220, 95, 97, 75, 60, 'S', 'B', 'A'],
  ['zhangfei', '장비', 'gongsun', 'pingyuan', 165, 221, 85, 98, 30, 25, 'S', 'C', 'A'],
  ['tiankai', '전해', 'gongsun', 'pingyuan', 165, 199, 70, 68, 40, 35, 'B', 'B', 'A'],
  // 조조
  ['caocao', '조조', 'cao', 'chenliu', 155, 220, 98, 72, 92, 94, 'A', 'A', 'A'],
  ['xiahoudun', '하후돈', 'cao', 'chenliu', 157, 220, 88, 88, 55, 65, 'A', 'B', 'A'],
  ['caohong', '조홍', 'cao', 'chenliu', 169, 232, 75, 78, 40, 45, 'A', 'B', 'A'],
  ['yuejin', '악진', 'cao', 'chenliu', 160, 218, 78, 85, 45, 40, 'S', 'C', 'B'],
  ['xunyu', '순욱', 'cao', 'chenliu', 163, 212, 60, 25, 96, 98, 'C', 'C', 'C'],
  ['xiahouyuan', '하후연', 'cao', 'puyang', 160, 219, 87, 88, 50, 40, 'B', 'A', 'S'],
  ['caoren', '조인', 'cao', 'puyang', 168, 223, 90, 85, 60, 50, 'S', 'B', 'A'],
  ['dianwei', '전위', 'cao', 'puyang', 160, 197, 70, 97, 30, 20, 'S', 'C', 'B'],
  ['caopi', '조비', 'cao', 'chenliu', 187, 226, 75, 65, 75, 80, 'B', 'B', 'A', 'caocao', 203],
  // 원술
  ['yuanshu', '원술', 'yuanshu', 'wan', 155, 199, 70, 60, 60, 55, 'B', 'B', 'B'],
  ['jiling', '기령', 'yuanshu', 'wan', 160, 199, 78, 80, 40, 35, 'S', 'B', 'B'],
  ['yanxiang', '염상', 'yuanshu', 'wan', 150, 199, 40, 25, 75, 70, 'C', 'C', 'C'],
  ['zhangxun', '장훈', 'yuanshu', 'runan', 160, 199, 70, 68, 50, 40, 'B', 'B', 'B'],
  ['leibo', '뇌박', 'yuanshu', 'runan', 160, 209, 65, 70, 30, 25, 'B', 'B', 'B'],
  ['qiaorui', '교유', 'yuanshu', 'runan', 160, 197, 62, 65, 30, 30, 'B', 'B', 'B'],
  // 유표
  ['liubiao', '유표', 'liu', 'xiangyang', 142, 208, 72, 50, 75, 82, 'A', 'A', 'C'],
  ['kuaiyue', '괴월', 'liu', 'xiangyang', 155, 214, 60, 30, 90, 85, 'C', 'B', 'C'],
  ['kuailiang', '괴량', 'liu', 'xiangyang', 155, 210, 55, 25, 88, 88, 'C', 'C', 'C'],
  ['caimao', '채모', 'liu', 'xiangyang', 160, 220, 75, 65, 65, 55, 'A', 'A', 'C'],
  ['huangzu', '황조', 'liu', 'xiangyang', 150, 208, 72, 70, 50, 40, 'B', 'A', 'C'],
  ['wenpin', '문빙', 'liu', 'xiangyang', 165, 230, 82, 82, 60, 55, 'A', 'A', 'B'],
  ['huangzhong', '황충', 'liu', 'xiangyang', 147, 220, 85, 92, 60, 50, 'B', 'S', 'B'],
  ['liuqi', '유기', 'liu', 'xiangyang', 175, 209, 50, 40, 55, 60, 'B', 'B', 'C', 'liubiao'],
  // 손견
  ['sunjian', '손견', 'sun', 'changsha', 155, 192, 90, 90, 70, 60, 'A', 'A', 'A'],
  ['sunce', '손책', 'sun', 'changsha', 175, 200, 92, 95, 70, 70, 'A', 'B', 'S', 'sunjian'],
  ['huanggai', '황개', 'sun', 'changsha', 150, 215, 80, 82, 65, 55, 'A', 'A', 'B'],
  ['chengpu', '정보', 'sun', 'changsha', 145, 215, 85, 80, 70, 60, 'A', 'A', 'B'],
  ['handang', '한당', 'sun', 'changsha', 155, 227, 78, 80, 40, 40, 'A', 'B', 'A'],
  ['zhuzhi', '주치', 'sun', 'changsha', 156, 224, 75, 70, 60, 60, 'A', 'A', 'B'],
  ['sunquan', '손권', 'sun', 'changsha', 182, 252, 85, 70, 80, 85, 'A', 'A', 'B', 'sunjian', 196],
  ['zhouyu', '주유', 'sun', 'changsha', 175, 210, 95, 75, 96, 85, 'A', 'S', 'B', null, 195],
  // 도겸
  ['taoqian', '도겸', 'tao', 'xiapi', 132, 194, 60, 40, 60, 70, 'B', 'B', 'C'],
  ['caobao', '조표', 'tao', 'xiapi', 150, 196, 62, 65, 30, 25, 'B', 'B', 'B'],
  ['mizhu', '미축', 'tao', 'xiapi', 165, 221, 40, 30, 70, 85, 'C', 'C', 'C'],
  ['chendeng', '진등', 'tao', 'xiapi', 163, 201, 75, 55, 85, 80, 'B', 'A', 'B'],
  ['zangba', '장패', 'tao', 'xiapi', 162, 230, 80, 82, 50, 45, 'A', 'B', 'B'],
  // 마등
  ['mateng', '마등', 'ma', 'wuwei', 156, 212, 82, 85, 45, 40, 'B', 'B', 'S'],
  ['hansui', '한수', 'ma', 'wuwei', 145, 215, 78, 72, 75, 55, 'B', 'B', 'A'],
  ['pangde', '방덕', 'ma', 'wuwei', 170, 219, 80, 92, 50, 40, 'A', 'B', 'S'],
  ['machao', '마초', 'ma', 'wuwei', 176, 222, 88, 97, 40, 30, 'B', 'C', 'S', 'mateng', 192],
  ['madai', '마대', 'ma', 'wuwei', 178, 240, 75, 80, 45, 35, 'B', 'B', 'A', null, 194],
  // 재야
  ['xuchu', '허저', null, 'xuchang', 170, 230, 80, 96, 35, 20, 'S', 'C', 'B'],
  ['xuhuang', '서황', null, 'xuchang', 165, 227, 85, 90, 65, 45, 'A', 'B', 'A'],
].map(r => ({
  id: r[0], name: r[1], faction: r[2], city: r[3], birth: r[4], death: r[5],
  lead: r[6], war: r[7], int: r[8], pol: r[9], apt: { inf: r[10], arc: r[11], cav: r[12] },
  parent: r[13] || null, appear: r[14] || r[4] + 16,
}));

var UNIT = {
  inf: { name: '보병', move: 2, range: 1, atk: 1.0, def: 1.15 },
  arc: { name: '궁병', move: 2, range: 4, atk: 0.8, def: 0.85 },
  cav: { name: '기병', move: 4, range: 1, atk: 1.35, def: 0.95 },
};
// 공격 병종 → 맞는 병종
var COUNTER = {
  inf: { inf: 1.0, arc: 1.0, cav: 1.15 },
  arc: { inf: 1.0, arc: 1.0, cav: 1.1 },
  cav: { inf: 1.0, arc: 1.4, cav: 1.0 },
};
var APT = { S: 1.2, A: 1.1, B: 1.0, C: 0.85 };
var APT_RANK = ['C', 'B', 'A', 'S'];

// 가상 인재 이름 조각(후한 사람 이름은 외자가 대부분)
var NAMES = {
  sur: ['왕', '이', '장', '유', '진', '양', '조', '황', '주', '오', '서', '손', '호', '고', '하', '곽', '마', '양', '송', '정', '한', '당', '풍', '동', '소', '원', '등', '허', '부', '심', '팽', '여', '위', '반', '염', '공', '번', '육', '왕', '두'],
  given: ['기', '량', '습', '무', '의', '충', '광', '소', '연', '탁', '휘', '영', '상', '준', '홍', '패', '웅', '통', '범', '엄', '겸', '담', '보', '견', '위', '강', '순', '훈', '옹', '규', '찬', '응', '건', '모', '함', '질', '봉', '랑', '익', '흠'],
};

var DATA = { REGIONS, CITIES, FACTIONS, GENERALS, UNIT, COUNTER, APT, APT_RANK, NAMES };
