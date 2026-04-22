const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');
content = content.replace(/\s*\{id:'s[4-9]'.*?\},/g, '');
content = content.replace(/sf_reset_pmmg_done_v3/g, 'sf_reset_pmmg_done_v4');
content = content.replace(
  "gsGrid.setStatic(true);\n      document.body.classList.remove('edit-mode');",
  "gsGrid.setStatic(true);\n      AppDB._set('sf_layout', gsGrid.save(false));\n      document.body.classList.remove('edit-mode');"
);
fs.writeFileSync('index.html', content, 'utf8');
