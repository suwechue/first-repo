// The Craft panel: recipes (gear plays a minigame that sets its quality, or is rushed for a Crude
// piece) and, with an Invention Bench, the Invention designer.
import { D } from '../core/content.js';
import { $, esc, costString, techNames } from './dom.js';
import { reqsMet } from '../systems/tech.js';
import { canAfford } from '../systems/inventory.js';
import { tryCraft } from '../systems/crafting.js';
import { itemName, propTier } from '../systems/gear.js';
import * as Inv from '../systems/invention.js';
import { openMinigame, minigameRegistered } from './minigames/runner.js';

// The designer's choices are UI state, not game state.
const plan = { recipe: null, vectors: {}, researchPoints: 0 };

function resultHtml(it, performance) {
  if (!it) return '<p class="bad">Nothing was made.</p>';
  const q = D.gear.qualities[it.quality].label;
  const props = (it.props || [])
    .map((p) => {
      const def = D.properties[p.id];
      const t = propTier(p);
      const bits = Object.entries({ ...t.stats, ...t.effects })
        .map(([k, v]) => `${k} ${v > 0 && v < 1 && /Mul$/.test(k) ? '×' + v : (v > 0 ? '+' : '') + v}`)
        .join(', ');
      return `<li><b>${def.name}</b> (${p.tier}): ${esc(bits)}</li>`;
    })
    .join('');
  return `<p>You made <b>${esc(itemName(it))}</b>${performance === null ? ' in a hurry' : ` (performance ${Math.round(performance * 100)}%)`}: ${q} quality.</p>
    ${props ? `<ul class="events">${props}</ul>` : ''}`;
}

function showResult(title, it, performance) {
  $('modal-body').innerHTML = `<h3>${esc(title)}</h3>${resultHtml(it, performance)}`;
  $('modal').classList.add('open');
}

function craftGear(s, key) {
  const r = D.recipes[key];
  const { minigame, difficulty } = Inv.gearMinigame(key);
  openMinigame(minigame, {
    s,
    title: 'Crafting ' + r.name,
    difficulty,
    category: Inv.categoryOf(r.item),
    onDone(perf) {
      const it = Inv.finishCraft(s, key, perf);
      showResult(r.name, it, perf);
      renderCraftPanel(s);
    },
  });
}

function recipeRows(s) {
  let html = '';
  for (const key in D.recipes) {
    const r = D.recipes[key];
    const unlocked = reqsMet(s, r.requires);
    const ok = unlocked && canAfford(s, r.costs);
    const gear = Inv.isGearRecipe(key);
    const mg = gear ? Inv.gearMinigame(key) : null;
    const note = mg ? ` <span class="muted small">(${mg.minigame}, difficulty ${mg.difficulty})</span>` : '';
    html += `<div class="item-row ${unlocked ? '' : 'locked'}">
      <div>
        <div class="item-name">${r.name}${note}</div>
        <div class="item-desc">${r.desc}</div>
        <div class="item-cost">${unlocked ? costString(s, r.costs) : 'Locked — requires ' + techNames(r.requires)}</div>
      </div>
      <div class="row">
        <button class="craft-btn" data-recipe="${key}" ${ok ? '' : 'disabled'}>Craft</button>
        ${gear ? `<button class="craft-btn" data-rush="${key}" ${ok ? '' : 'disabled'} title="Skip the minigame: always Crude">Rush it</button>` : ''}
      </div></div>`;
  }
  return html;
}

function inventionHtml(s) {
  if (!s.buildings.some((b) => D.buildings[b.type]?.invention)) return '';
  const known = Object.keys(D.recipes).filter(
    (k) => Inv.isGearRecipe(k) && reqsMet(s, D.recipes[k].requires),
  );
  if (!plan.recipe || !known.includes(plan.recipe)) plan.recipe = known[0] || null;
  const vectors = Inv.inventionVectors(s);
  for (const v of Object.keys(plan.vectors)) if (!vectors.includes(v)) delete plan.vectors[v];
  const used = Object.values(plan.vectors).reduce((a, b) => a + b, 0);
  const pool = Inv.vectorPool(s);
  const err = Inv.inventionError(s, plan);
  const r = plan.recipe ? D.recipes[plan.recipe] : null;
  const category = r ? Inv.categoryOf(r.item) : 'weapon';
  const mg = Inv.chooseArchetype(plan.vectors, category, minigameRegistered);
  const weights = Inv.propertyWeights(plan.vectors, category, 0.5);
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const likely = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, w]) => `${D.properties[k].name} ${Math.round((w / sum) * 100)}%`)
    .join(' · ');
  return `<h4>Invention</h4>
    <p class="small muted">Design a new piece on top of a recipe you know. Spend Vector points (${used} of ${pool}) to steer which properties it can roll; Research Points (5 Knowledge each) add rolls. You must stand at the Invention Bench.</p>
    <div class="set-row">Base <select id="inv-recipe">${known
      .map((k) => `<option value="${k}" ${k === plan.recipe ? 'selected' : ''}>${D.recipes[k].name}</option>`)
      .join('')}</select> ${r ? `<span class="small">${costString(s, r.costs)}</span>` : ''}</div>
    <div class="inv-vectors">${vectors
      .map(
        (v) =>
          `<label class="set-row">${D.vectors[v].name} <input type="number" min="0" max="${pool}" step="1" data-vec="${v}" value="${plan.vectors[v] || 0}"></label>`,
      )
      .join('')}</div>
    <label class="set-row">Research Points <input type="number" id="inv-rp" min="0" max="${D.minigames.invention.maxResearchPoints}" value="${plan.researchPoints}"> <span class="small">(${Inv.inventionKp(plan)} Knowledge)</span></label>
    <p class="small">Complexity ${Inv.complexity(plan.vectors).toFixed(1)} · difficulty ${Inv.difficultyOf(plan.vectors)} · minigame <b>${mg}</b><br>
      Likely properties: ${likely || '<span class="muted">none yet; put more points in one Vector to reach a property</span>'}</p>
    <div class="row"><button class="craft-btn big" id="inv-start" ${err ? 'disabled' : ''}>Begin</button>
      <span class="small ${err ? 'bad' : 'muted'}">${esc(err || 'Ready.')}</span></div>`;
}

export function renderCraftPanel(s) {
  const el = $('craft-list');
  el.innerHTML = recipeRows(s) + inventionHtml(s);
  el.querySelectorAll('button[data-recipe]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-recipe');
      if (Inv.isGearRecipe(key)) craftGear(s, key);
      else tryCraft(s, key);
    }),
  );
  el.querySelectorAll('button[data-rush]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-rush');
      const it = Inv.finishCraft(s, key, 0, { rushed: true });
      showResult(D.recipes[key].name, it, null);
      renderCraftPanel(s);
    }),
  );
  $('inv-recipe')?.addEventListener('change', (e) => {
    plan.recipe = e.target.value;
    renderCraftPanel(s);
  });
  el.querySelectorAll('[data-vec]').forEach((inp) =>
    inp.addEventListener('change', () => {
      plan.vectors[inp.getAttribute('data-vec')] = Math.max(0, Math.floor(Number(inp.value) || 0));
      renderCraftPanel(s);
    }),
  );
  $('inv-rp')?.addEventListener('change', (e) => {
    plan.researchPoints = Math.max(0, Math.floor(Number(e.target.value) || 0));
    renderCraftPanel(s);
  });
  $('inv-start')?.addEventListener('click', () => {
    const r = D.recipes[plan.recipe];
    const category = Inv.categoryOf(r.item);
    const vectors = { ...plan.vectors };
    const go = { recipe: plan.recipe, vectors, researchPoints: plan.researchPoints };
    openMinigame(Inv.chooseArchetype(vectors, category, minigameRegistered), {
      s,
      title: 'Inventing a new ' + D.items[r.item].name,
      difficulty: Inv.difficultyOf(vectors),
      category,
      vectors,
      onDone(perf) {
        const it = Inv.finishInvention(s, go, perf);
        showResult('Invention', it, perf);
        renderCraftPanel(s);
      },
    });
  });
}
