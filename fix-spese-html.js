const fs = require('fs');
let html = fs.readFileSync('src/app/section-page.html', 'utf8');

// 1. Remove crm-section-hero completely
html = html.replace(/<section class="crm-section-hero">[\s\S]*?<\/section>/, '');

// 2. Change <div class="op-grid three-col"> to <div class="op-grid">
html = html.replace(/<div class="op-grid three-col">/, '<div class="op-grid">');

// 3. Remove the first card (Inserimento nuova spesa + tabs)
const firstCardRx = /<div class="op-card">\s*<div class="op-card-title-row">\s*<h2 class="op-card-title">Inserimento nuova spesa<\/h2>[\s\S]*?<div class="op-card">\s*<h2 class="op-card-title">Registro spese<\/h2>/;
const replacementFirstCard = `<div class="op-card">
            <div class="op-card-title-row">
              <h2 class="op-card-title">Registro spese</h2>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn-secondary" (click)="opeconst fs = require('fs');
let html = fs.readFilet html = fs.readFileSync('"or