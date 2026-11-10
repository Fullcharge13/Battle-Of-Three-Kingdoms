// 화면 없이 게임 규칙(data.js + core.js)을 Node에서 불러온다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadGame() {
  const ctx = { console, Math, JSON, Date };
  vm.createContext(ctx);
  for (const f of ['data.js', 'core.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx.GUNUNG;
}
module.exports = { loadGame };
