// ============================================================================
// CONFIG — all game DATA lives here. This is the file to edit for content
// changes (new resources, tech, recipes, buildings, classes, traits, realms,
// enemies) without touching logic.
//
// ART/ASSET MODULARITY:
// SPRITE_MANIFEST and ICON_MANIFEST list the filenames the game looks for.
// Drop a matching PNG into assets/sprites/ or assets/icons/ and the game
// will automatically use it instead of the built-in procedural placeholder
// shape — no code changes needed. If a file is missing, the game silently
// falls back to the placeholder art (see render.js), so nothing ever breaks
// while you're still producing assets.
// ============================================================================

window.Game = window.Game || {};

Game.config = {

  CANVAS_W: 900,
  CANVAS_H: 560,
  PLAYER_SPEED: 2.6,
  GATHER_RANGE: 42,
  SAVE_KEY: 'primitive_age_save_v1',
  SAVE_VERSION: 1,

  // --------------------------------------------------------------------
  // RESOURCE NODES (world objects the player gathers from)
  // --------------------------------------------------------------------
  RESOURCE_TYPES: {
    tree:      { yields:'wood',  color:'#2f4a22', trunk:'#5a3d24', amount:5, respawn:900,  radius:16 },
    rock:      { yields:'stone', color:'#7a7568', amount:4, respawn:1400, radius:14 },
    bush:      { yields:'fiber', color:'#3c6b2a', berry:'#b23a3a', amount:3, respawn:700,  radius:10 },
    berrybush: { yields:'food',  color:'#3c6b2a', berry:'#c94f4f', amount:3, respawn:1100, radius:10 }
  },

  // Inventory keys always shown in the resource bar; others appear once > 0.
  CORE_RES: ['wood','stone','fiber','food','cookedfood'],
  INVENTORY_DEFAULTS: {
    wood:0, stone:0, fiber:0, food:0, cookedfood:0, hide:0, supplies:0,
    wildroot:0, enchanted_wood:0, mana_crystal:0, beast_core:0, verdant_silk:0
  },
  RES_LABEL: {
    wood:'Wood', stone:'Stone', fiber:'Fiber', food:'Food', cookedfood:'Cooked food', hide:'Hide',
    supplies:'Expedition Supply', wildroot:'Wildroot', enchanted_wood:'Enchanted Wood',
    mana_crystal:'Mana Crystal', beast_core:'Beast Core', verdant_silk:'Verdant Silk'
  },

  // --------------------------------------------------------------------
  // TECH TREE
  //   cost      Knowledge Points
  //   arcane    Arcane Knowledge (earned only by exploring realms)
  //   extra     resources consumed on unlock, e.g. {mana_crystal:3}
  //   needsNexus  tech can only be researched once the Nexus is awakened
  // --------------------------------------------------------------------
  TECH: {
    fire_making:        { name:'Fire Making',        cost:0,  prereq:[],                    unlocked:true,  desc:'Free — everyone starts knowing how to make fire.' },
    stone_knapping:     { name:'Stone Knapping',     cost:0,  prereq:[],                    unlocked:true,  desc:'Free — sharpen stone into tools.' },
    woodworking:        { name:'Woodworking',        cost:10, prereq:['stone_knapping'],    unlocked:false, desc:'Unlocks huts and wooden tools.' },
    basic_construction: { name:'Basic Construction', cost:15, prereq:['woodworking'],       unlocked:false, desc:'Unlocks the Palisade wall.' },
    cooking:            { name:'Cooking',            cost:8,  prereq:['fire_making'],       unlocked:false, desc:'Cook raw food at a Campfire for more Hunger restored.' },
    basic_agriculture:  { name:'Basic Agriculture',  cost:12, prereq:['fire_making'],       unlocked:false, desc:'Unlocks the Farm Plot, which slowly grows food on its own.' },
    tanning:            { name:'Tanning',            cost:8,  prereq:['fire_making'],       unlocked:false, desc:'Cure hides from wolves into Hide Armor.' },
    shamanic_rites:     { name:'Shamanic Rites',     cost:12, prereq:['woodworking'],       unlocked:false, desc:'Unlocks the Shrine, where Mana Awareness slowly gathers.' },
    foundation_engineering: { name:'Foundation Engineering', cost:20, prereq:['basic_construction'], unlocked:false,
                          desc:'Lets you safely dig out the buried Nexus. Also unlocks Expedition Supplies and realm gear.' },
    elemental_attunement: { name:'Elemental Attunement', cost:25, arcane:8, extra:{ mana_crystal:3 }, needsNexus:true,
                          prereq:['shamanic_rites'], unlocked:false,
                          desc:'Tier 1 magic. Mages with Heat, Cold, Force or Motion vectors can now be recruited.' }
  },

  // --------------------------------------------------------------------
  // GEAR — items that can be equipped by characters on expeditions.
  //   gear      flat Combat Power bonus
  //   armorMod  reduces injury chance (armor only)
  //   dmg       the player avatar's direct-combat damage (weapons only)
  // --------------------------------------------------------------------
  ITEMS: {
    stone_axe:     { name:'Stone Axe',     slot:'weapon', gear:3, dmg:3 },
    stone_spear:   { name:'Stone Spear',   slot:'weapon', gear:4, dmg:4 },
    hide_armor:    { name:'Hide Armor',    slot:'armor',  gear:4, armorMod:0.12 },
    wildwood_spear:{ name:'Wildwood Spear',slot:'weapon', gear:9, dmg:6 },
    verdant_cloak: { name:'Verdant Cloak', slot:'armor',  gear:8, armorMod:0.22 }
  },

  // --------------------------------------------------------------------
  // CRAFTABLE ITEMS / ACTIONS
  //   type 'item'   -> adds r.item to the armory (and updates player weapon)
  //   type 'cook'   -> needs a nearby campfire
  //   type 'supply' -> adds r.yields to the inventory
  // --------------------------------------------------------------------
  RECIPES: {
    stone_axe:   { name:'Stone Axe',    desc:'Weapon. Raises your damage and a squad member\'s Combat Power.', costs:{wood:2, stone:3}, requires:['stone_knapping'], type:'item', item:'stone_axe' },
    stone_spear: { name:'Stone Spear',  desc:'Weapon. Better damage and Combat Power.',                        costs:{wood:3, stone:2}, requires:['stone_knapping'], type:'item', item:'stone_spear' },
    hide_armor:  { name:'Hide Armor',   desc:'Armor. Lowers injury chance on expeditions.',                     costs:{hide:3, fiber:2}, requires:['tanning'], type:'item', item:'hide_armor' },
    cook_food:   { name:'Cook Food (at Campfire)', desc:'Turn raw food into cooked food (restores more Hunger)', costs:{food:1}, requires:['cooking'], type:'cook', needsFire:true },
    supplies:    { name:'Expedition Supplies ×2', desc:'Packed rations and rope. Each squad member uses one per expedition.', costs:{food:3, fiber:2}, requires:['foundation_engineering'], type:'supply', yields:{supplies:2} },
    wildwood_spear:{ name:'Wildwood Spear', desc:'Weapon made from Enchanted Wood. Strong Combat Power.',       costs:{enchanted_wood:3, stone:2}, requires:['woodworking','foundation_engineering'], type:'item', item:'wildwood_spear' },
    verdant_cloak: { name:'Verdant Cloak',  desc:'Armor lined with Verdant Silk. Strong injury protection.',    costs:{verdant_silk:3, hide:2},    requires:['tanning','foundation_engineering'],   type:'item', item:'verdant_cloak' }
  },

  // --------------------------------------------------------------------
  // PLACEABLE BUILDINGS
  // --------------------------------------------------------------------
  BUILDINGS: {
    campfire: { name:'Campfire', desc:'Lets you cook food nearby.',                costs:{wood:3, stone:2},          requires:['fire_making'],       radius:14, color:'#c9702e' },
    hut:      { name:'Hut',      desc:'A place to call home. (Cosmetic this build)', costs:{wood:8, stone:2, fiber:3}, requires:['woodworking'],       radius:20, color:'#8a5a34' },
    palisade: { name:'Palisade Post', desc:'A defensive wall segment.',            costs:{wood:5, stone:1},          requires:['basic_construction'], radius:8,  color:'#5a3d24' },
    farm_plot: { name:'Farm Plot', desc:'Passively produces food over time.',       costs:{wood:2, fiber:2},          requires:['basic_agriculture'],  radius:12, color:'#7a9c4a',
                 growthTime: 1200, yieldAmount: 2 },
    shrine:   { name:'Shrine', desc:'Attunes your people to the Nexus. Each Shrine adds Mana Awareness over time.',
                 costs:{wood:6, stone:4, fiber:2}, requires:['shamanic_rites'], radius:14, color:'#8f7ad1', awarenessTime: 180 }
  },

  // --------------------------------------------------------------------
  // THE NEXUS — buried at a fixed spot. Stage 1 gate into Stage 2.
  // --------------------------------------------------------------------
  NEXUS: {
    x: 790, y: 170, radius: 34, interactRange: 70,
    digSteps: 3, digCost: { stone:4, wood:2 },
    awarenessNeeded: 40, awarenessCap: 100,
    startingSupplies: 4, startingRenown: 10
  },

  // --------------------------------------------------------------------
  // CHARACTERS
  // --------------------------------------------------------------------
  VECTORS: ['heat','cold','force','motion'],

  CLASSES: {
    gatherer:  { name:'Gatherer',  primary:['per','con'], role:'back',    skill:{ gather:6 } },
    hunter:    { name:'Hunter',    primary:['dex','per'], role:'back',    skill:{ hunt:6, explore:2 } },
    toolmaker: { name:'Toolmaker', primary:['int','dex'], role:'back',    skill:{ gather:3 } },
    farmer:    { name:'Farmer',    primary:['con','int'], role:'back',    skill:{ gather:3 } },
    warrior:   { name:'Warrior',   primary:['str','con'], role:'front',   skill:{} },
    scout:     { name:'Scout',     primary:['dex','per'], role:'back',    skill:{ explore:6, hunt:3 } },
    shaman:    { name:'Shaman',    primary:['wil','int'], role:'support', skill:{ explore:2 }, arcaneBase:3 },
    herbalist: { name:'Herbalist', primary:['int','wil'], role:'support', skill:{ gather:3 } },
    mage:      { name:'Mage',      primary:['int','wil'], role:'caster',  skill:{}, arcane:true, needsTech:'elemental_attunement' }
  },

  STAT_LABELS: { str:'STR', con:'CON', dex:'DEX', int:'INT', per:'PER', wil:'WIL' },

  // Generation (see character_generation_creation.md)
  TIERS: {
    common:   { label:'Common',   weight:70, budget:24, traits:1, cost:6  },
    uncommon: { label:'Uncommon', weight:25, budget:32, traits:2, cost:12 },
    rare:     { label:'Rare',     weight:5,  budget:42, traits:3, cost:24 }
  },
  STAT_FLOOR: 3,
  // Every trait roll draws from the same pool regardless of tier, so a Common
  // recruit has exactly the same chance (3%) of a Notable trait as a Rare one.
  TRAIT_POOL_WEIGHTS: { common:70, uncommon:27, notable:3 },

  BACKGROUNDS: {
    farmer:     { name:'Farmer',     weight:25, classes:{ farmer:60, gatherer:40 },                          nudge:{ con:1.4 } },
    hunter:     { name:'Hunter',     weight:25, classes:{ hunter:70, scout:30 },                             nudge:{ dex:1.3, per:1.3 } },
    laborer:    { name:'Laborer',    weight:25, classes:{ warrior:50, gatherer:30, toolmaker:20 },           nudge:{ str:1.4 } },
    apprentice: { name:'Apprentice', weight:25, classes:{ toolmaker:25, scout:20, shaman:25, herbalist:25 }, nudge:{ int:1.4 } }
  },

  // effects: cp (flat Combat Power), injuryMul, xpMul, arcane (casters), exploreCp, stoic (grief immune),
  //          conBonus, perBonus, encounterMul, renownMul
  TRAITS: {
    brave:         { name:'Brave',          rarity:'common',   desc:'+2 Combat Power.', cp:2 },
    cautious:      { name:'Cautious',       rarity:'common',   desc:'10% less likely to be hurt.', injuryMul:0.9 },
    hardy:         { name:'Hardy',          rarity:'common',   desc:'Counts as +2 CON when taking hits.', conBonus:2 },
    curious:       { name:'Curious',        rarity:'common',   desc:'+3 Combat Power while exploring.', exploreCp:3 },
    quick_tempered:{ name:'Quick-Tempered', rarity:'common',   desc:'+1 Combat Power, clashes with cautious people.', cp:1 },
    keen_eyed:     { name:'Keen-Eyed',      rarity:'uncommon', desc:'Counts as +2 PER.', perBonus:2 },
    stoic:         { name:'Stoic',          rarity:'uncommon', desc:'Not shaken by deaths in the squad.', stoic:true },
    silver_tongued:{ name:'Silver-Tongued', rarity:'uncommon', desc:'+15% Renown from missions.', renownMul:1.15 },
    night_vision:  { name:'Night Vision',   rarity:'uncommon', desc:'Squad meets fewer ambushes.', encounterMul:0.93 },
    mana_sensitive:{ name:'Mana Sensitive', rarity:'notable',  desc:'+4 arcane power. Rare gift.', arcane:4 },
    dragon_blood:  { name:'Dragon Blood',   rarity:'notable',  desc:'+6 Combat Power, 20% less likely to be hurt.', cp:6, injuryMul:0.8 },
    genius:        { name:'Genius',         rarity:'notable',  desc:'Learns 40% faster.', xpMul:1.4 },
    prodigy:       { name:'Prodigy',        rarity:'notable',  desc:'+3 Combat Power, learns 25% faster.', cp:3, xpMul:1.25 }
  },
  TRAIT_CLASH:   [['brave','cautious'], ['quick_tempered','cautious'], ['silver_tongued','quick_tempered']],
  TRAIT_SYNERGY: [['brave','stoic'], ['cautious','curious'], ['hardy','brave'], ['keen_eyed','curious']],

  // Talents are earned by growth rolls at level-up.
  TALENTS: {
    battle_instinct: { name:'Battle Instinct', desc:'+3 Combat Power.', cp:3 },
    iron_will:       { name:'Iron Will',       desc:'Shrugs off grief after a death.', stoic:true },
    natural_leader:  { name:'Natural Leader',  desc:'+3% squad synergy (one per squad counts).', synergy:0.03 },
    second_wind:     { name:'Second Wind',     desc:'30% less likely to die when hurt.', deathMul:0.7 },
    keen_tracking:   { name:'Keen Tracking',   desc:'+3 Combat Power on hunts and exploration.', huntCp:3, exploreCp:3 },
    efficient_gatherer:{ name:'Efficient Gatherer', desc:'+12% gathered resources.', yieldMul:0.12 },
    field_medic:     { name:'Field Medic',     desc:'Squad deaths are 25% less likely while this person lives.', squadDeathMul:0.75 },
    arcane_affinity: { name:'Arcane Affinity', desc:'+4 arcane power.', arcane:4 },
    steady_hands:    { name:'Steady Hands',    desc:'+2 Combat Power on gathering.', gatherCp:2 }
  },
  TALENT_TABLES: {
    gatherer:  { efficient_gatherer:25, steady_hands:25, keen_tracking:10, battle_instinct:10, second_wind:15, iron_will:15 },
    hunter:    { keen_tracking:30, battle_instinct:20, second_wind:15, iron_will:10, efficient_gatherer:10, natural_leader:5 },
    toolmaker: { steady_hands:25, efficient_gatherer:20, battle_instinct:10, second_wind:15, iron_will:15, natural_leader:5 },
    farmer:    { efficient_gatherer:30, steady_hands:20, second_wind:20, iron_will:20, battle_instinct:10 },
    warrior:   { battle_instinct:30, second_wind:25, iron_will:20, natural_leader:15, steady_hands:10 },
    scout:     { keen_tracking:35, battle_instinct:15, second_wind:15, iron_will:10, natural_leader:10, efficient_gatherer:15 },
    shaman:    { arcane_affinity:25, field_medic:20, iron_will:25, natural_leader:15, second_wind:15 },
    herbalist: { field_medic:35, second_wind:20, iron_will:20, efficient_gatherer:15, natural_leader:10 },
    mage:      { arcane_affinity:40, second_wind:15, iron_will:15, battle_instinct:10, natural_leader:10, field_medic:10 }
  },
  TALENT_ROLL_CHANCE: 0.55,   // chance of a talent roll each level (pity guarantees one after 3 dry levels)
  PITY_LEVELS: 3,

  FIRST_NAMES: ['Kael','Boris','Lin','Elena','Aria','Marcus','Sera','Tomas','Iris','Dorn','Maeve','Ruan','Vess','Oren','Talia','Joss','Bram','Nyla','Pike','Edda','Corin','Wren','Hale','Mira','Garrick','Sol','Fenn','Odalys','Rook','Ysolde'],
  SURNAMES: ['Marren','Voss','Ashby','Thorne','Hale','Brook','Calder','Dunmore','Eastwick','Fallow','Greer','Holloway','Ives','Keld','Lowe','Merrow','Penn','Quill','Rowan','Stroud'],

  // The opening roster is hand-authored so the tutorial is fair.
  STARTER_ROSTER: [
    { name:'Kael Marren',  cls:'hunter',    stats:{ str:6,  con:7,  dex:10, int:5, per:10, wil:4 }, traits:['brave'] },
    { name:'Boris Voss',   cls:'warrior',   stats:{ str:10, con:10, dex:7,  int:4, per:6,  wil:5 }, traits:['hardy'] },
    { name:'Lin Ashby',    cls:'shaman',    stats:{ str:4,  con:6,  dex:6,  int:9, per:7,  wil:10 }, traits:['curious'] },
    { name:'Elena Thorne', cls:'herbalist', stats:{ str:4,  con:7,  dex:7,  int:9, per:8,  wil:7 }, traits:['cautious'] }
  ],

  // --------------------------------------------------------------------
  // MISSIONS (see the master design doc, section 8)
  // --------------------------------------------------------------------
  MISSION: {
    INJURY_BASE: 0.35, DEATH_BASE: 0.2,
    LOSS_INJURY_MUL: 1.6, LOSS_DEATH_MUL: 1.5,
    SUPPORT_DEATH_MUL: 0.6,
    GRIEF_CP_MUL: 0.85, GRIEF_MISSIONS: 2,
    RETREAT_OPTIONS: [25, 35, 50, 70],
    XP_BASE: 14, XP_SUCCESS: 10,
    MIN_SQUAD: 2, MAX_SQUAD: 4,
    BLOOD_FEUD: -86
  },

  BOND_TIERS: [
    { min:86,  name:'Unbreakable Bond', mod:0.15 },
    { min:66,  name:'Close Bond',       mod:0.10 },
    { min:41,  name:'Trusted',          mod:0.06 },
    { min:21,  name:'Familiar',         mod:0.03 },
    { min:-20, name:'Stranger',         mod:0 },
    { min:-40, name:'Tension',          mod:-0.05 },
    { min:-65, name:'Rivalry',          mod:-0.10 },
    { min:-85, name:'Grudge',           mod:-0.18 },
    { min:-100,name:'Blood Feud',       mod:-0.30 }
  ],

  // --------------------------------------------------------------------
  // ENEMIES — etr is Enemy Threat Rating, in the same units as Combat Power.
  // --------------------------------------------------------------------
  ENEMIES: {
    wild_sprites:   { name:'a swarm of Wild Sprites', short:'Wild Sprites',   etr:18,  weakTo:['cold'],  resists:[],        xp:6,   drops:{} },
    thornback_boar: { name:'a Thornback Boar',        short:'Thornback Boar', etr:55,  weakTo:['heat'],  resists:['force'], xp:14,  drops:{ hide:[1,0.6] } },
    mana_wisp:      { name:'a Mana Wisp',             short:'Mana Wisp',      etr:75,  weakTo:['force'], resists:['heat'],  xp:18,  drops:{ mana_crystal:[1,0.5] } },
    goblin_raiders: { name:'a Goblin raiding party',  short:'Goblin Raiders', etr:120, weakTo:['motion','heat'], resists:[], xp:28, drops:{ beast_core:[1,0.45], verdant_silk:[1,0.3] } },
    grove_warden:   { name:'the Grove Warden',        short:'Grove Warden',   etr:380, weakTo:['heat'],  resists:['cold'],  xp:120, boss:true,
                      drops:{ mana_crystal:[3,1], enchanted_wood:[2,1] }, fragment:{ id:'gravitational', amount:17 } }
  },

  // --------------------------------------------------------------------
  // REALMS — data only. Add a realm or zone here; the Expedition Hall and the
  // mission resolver read it automatically.
  //   deathScale: multiplies death chance (early zones are gentler)
  // --------------------------------------------------------------------
  REALMS: {
    verdant_wilds: {
      name: 'Verdant Wilds',
      blurb: 'An overgrown, magic-soaked forest. The mana here cannot be found at home.',
      zones: {
        fringe: {
          name:'The Fringe', steps:5, encounterChance:0.40, deathScale:0.4, renown:3, exploreArcane:1,
          unlock:null,
          enemies:[ { id:'wild_sprites', w:70 }, { id:'thornback_boar', w:30 } ],
          resources:[ { id:'wildroot', base:2 }, { id:'enchanted_wood', base:1 } ],
          hunt:['thornback_boar']
        },
        groves: {
          name:'The Groves', steps:5, encounterChance:0.50, deathScale:0.7, renown:4, exploreArcane:2,
          unlock:{ zone:'fringe', explored:60 },
          enemies:[ { id:'wild_sprites', w:35 }, { id:'thornback_boar', w:30 }, { id:'mana_wisp', w:35 } ],
          resources:[ { id:'mana_crystal', base:1 }, { id:'wildroot', base:2 } ],
          hunt:['mana_wisp']
        },
        warrens: {
          name:'The Warrens', steps:6, encounterChance:0.55, deathScale:1, renown:6, exploreArcane:2,
          unlock:{ zone:'groves', explored:60 },
          enemies:[ { id:'goblin_raiders', w:55 }, { id:'wild_sprites', w:20 }, { id:'thornback_boar', w:25 } ],
          resources:[ { id:'beast_core', base:1 }, { id:'verdant_silk', base:1 } ],
          hunt:['goblin_raiders']
        },
        old_grove: {
          name:'The Old Grove', steps:6, encounterChance:0.60, deathScale:1, renown:10, exploreArcane:3,
          unlock:{ zone:'warrens', explored:60 },
          enemies:[ { id:'thornback_boar', w:50 }, { id:'mana_wisp', w:50 } ],
          resources:[ { id:'mana_crystal', base:2 }, { id:'enchanted_wood', base:2 } ],
          hunt:['grove_warden']
        }
      }
    }
  },

  // --------------------------------------------------------------------
  // ART ASSETS — see note at top of file
  // --------------------------------------------------------------------
  SPRITE_MANIFEST: {
    player:    'assets/sprites/player.png',
    wolf:      'assets/sprites/wolf.png',
    tree:      'assets/sprites/tree.png',
    rock:      'assets/sprites/rock.png',
    bush:      'assets/sprites/bush.png',
    berrybush: 'assets/sprites/berrybush.png',
    campfire:  'assets/sprites/campfire.png',
    hut:       'assets/sprites/hut.png',
    palisade:  'assets/sprites/palisade.png',
    farm_plot: 'assets/sprites/farm_plot.png',
    shrine:    'assets/sprites/shrine.png',
    nexus_buried:   'assets/sprites/nexus_buried.png',
    nexus_excavated:'assets/sprites/nexus_excavated.png',
    nexus_awake:    'assets/sprites/nexus_awake.png',
    villager:  'assets/sprites/villager.png',
    ground:    'assets/sprites/ground.png'   // tiling ground texture, optional
  },

  ICON_MANIFEST: {
    wood:       'assets/icons/wood.png',
    stone:      'assets/icons/stone.png',
    fiber:      'assets/icons/fiber.png',
    food:       'assets/icons/food.png',
    cookedfood: 'assets/icons/cookedfood.png',
    hide:       'assets/icons/hide.png',
    supplies:   'assets/icons/supplies.png',
    wildroot:   'assets/icons/wildroot.png',
    enchanted_wood:'assets/icons/enchanted_wood.png',
    mana_crystal:'assets/icons/mana_crystal.png',
    beast_core: 'assets/icons/beast_core.png',
    verdant_silk:'assets/icons/verdant_silk.png'
  },

  // Draw size (in canvas pixels) used when a sprite image IS found.
  SPRITE_SIZES: {
    player:    { w:26, h:26 },
    wolf:      { w:32, h:22 },
    tree:      { w:52, h:52 },
    rock:      { w:32, h:26 },
    bush:      { w:24, h:24 },
    berrybush: { w:24, h:24 },
    campfire:  { w:26, h:26 },
    hut:       { w:52, h:44 },
    palisade:  { w:18, h:34 },
    farm_plot: { w:30, h:20 },
    shrine:    { w:26, h:30 },
    nexus_buried:    { w:84, h:64 },
    nexus_excavated: { w:84, h:84 },
    nexus_awake:     { w:92, h:92 },
    villager:  { w:18, h:20 }
  },

  // Emoji fallback used for resource-bar icons if no icon PNG is found
  RES_ICON_FALLBACK: {
    wood:'🪵', stone:'🪨', fiber:'🌾', food:'🍒', cookedfood:'🍖', hide:'🐾', supplies:'🎒',
    wildroot:'🌿', enchanted_wood:'🪄', mana_crystal:'💎', beast_core:'🔴', verdant_silk:'🧵'
  }
};
