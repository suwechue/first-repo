// Loads every JSON file in src/data into one read-only content object.
// To add a realm, add its file to REALM_FILES. A later mod overlay can deep-merge onto RAW here.
import game from '../data/game.json' with { type: 'json' };
import materials from '../data/materials.json' with { type: 'json' };
import resources from '../data/resources.json' with { type: 'json' };
import nexus from '../data/nexus.json' with { type: 'json' };
import tech from '../data/tech.json' with { type: 'json' };
import recipes from '../data/recipes.json' with { type: 'json' };
import items from '../data/items.json' with { type: 'json' };
import buildings from '../data/buildings.json' with { type: 'json' };
import classes from '../data/classes.json' with { type: 'json' };
import traits from '../data/traits.json' with { type: 'json' };
import talents from '../data/talents.json' with { type: 'json' };
import backgrounds from '../data/backgrounds.json' with { type: 'json' };
import tiers from '../data/tiers.json' with { type: 'json' };
import bonds from '../data/bonds.json' with { type: 'json' };
import names from '../data/names.json' with { type: 'json' };
import starterRoster from '../data/starter_roster.json' with { type: 'json' };
import enemies from '../data/enemies.json' with { type: 'json' };
import mission from '../data/mission.json' with { type: 'json' };
import verdantWilds from '../data/realms/verdant_wilds.json' with { type: 'json' };
import world from '../data/world.json' with { type: 'json' };
import biomes from '../data/biomes.json' with { type: 'json' };
import props from '../data/props.json' with { type: 'json' };
import landmarks from '../data/landmarks.json' with { type: 'json' };
import vectors from '../data/vectors.json' with { type: 'json' };
import forms from '../data/forms.json' with { type: 'json' };
import knowledgeTiers from '../data/knowledge_tiers.json' with { type: 'json' };
import growthTables from '../data/growth_tables.json' with { type: 'json' };
import specializations from '../data/specializations.json' with { type: 'json' };
import oldCity from '../data/prefabs/old_city.json' with { type: 'json' };

const REALM_FILES = { verdant_wilds: verdantWilds };
const PREFAB_FILES = { old_city: oldCity };

export const RAW = {
  game,
  materials,
  resources,
  nexus,
  tech,
  recipes,
  items,
  buildings,
  classes,
  traits,
  talents,
  backgrounds,
  tiers,
  bonds,
  names,
  starterRoster,
  enemies,
  mission,
  realms: REALM_FILES,
  world,
  biomes,
  props,
  landmarks,
  vectors,
  forms,
  knowledgeTiers,
  growthTables,
  specializations,
  prefabs: PREFAB_FILES,
};

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

/** All game content, frozen: anything that changes during play lives in GameState. */
export const D = deepFreeze(structuredClone(RAW));
