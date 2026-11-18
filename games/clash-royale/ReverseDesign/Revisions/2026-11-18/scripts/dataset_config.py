"""Pinned public archive configuration. These are NOT current live-game values."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AS_OF = '2026-11-17'
ARCHIVE_DATE = '2023-10-18'
ARCHIVE_COMMIT = 'd5461b0a59bff33c4da2fc845b07275b66b2d6ff'
SNAPSHOT_ID = 'royaleapi_2023_10_18'
INPUTS = {
    'cards': ('cards.json', 'c23faae5a5d2397f9adf36cc2dae87e5074d13cd8afe57a1de89006629a988b5'),
    'card_stats': ('cards_stats.json', '664c35ac1f8717f8ed4331fa1a3af1216bb6d45832487ab0917c30799016fbc7'),
    'rarities': ('rarities.json', 'ed71f6bef50f009d517830f80330efc5bcf45aa37382ef3d19d17147b7433c9b'),
    'cards_i18n': ('cards_i18n.json', 'eb328c08e8542cbfce0d7d692d8acfcdda8d56c1bfc7dbf8bb31dc5c98c5de8d'),
}
CARD_FIELDS = set('key name sc_key elixir type rarity arena id evolved_spells_sc_key is_evolved'.split())
RARITY_FIELDS = set('name level_count relative_level tournament_level_index power_level_multiplier'.split())
# Only numerical/behavioral facts and their identifiers are retained. No flavor
# text, images, models, audio, UI asset definitions, or complete upstream files.
STAT_FIELDS = set('''name key id sc_key rarity not_visible not_in_use mana_cost
custom_deploy_time summon_character summon_number summon_character_level_index
summon_character_second summon_character_second_count summon_radius summon_width
summon_deploy_delay summon_deploy_delay_second radius projectile projectile_special
custom_first_projectile projectile_interval projectile_waves projectile_wave_interval
duration_seconds area_effect_object can_deploy_on_enemy_side can_place_on_buildings
can_place_on_water mirror hero_ability passive_ability ability_cooldown evolved_spells
sight_range deploy_time speed hitpoints hit_speed load_time damage damage_special
crown_tower_damage_percent load_first_hit load_after_retarget multiple_projectiles
multiple_targets range minimum_range special_min_range special_range attacks_ground
attacks_air area_damage_radius target_only_buildings target_only_troops target_only_towers
life_time collision_radius mass flying_height hovering charge_range
spawn_start_time spawn_interval spawn_number spawn_character spawn_character2 spawn_character3
death_damage death_damage_radius death_spawn_count death_spawn_character death_spawn_character2
death_spawn_count2 death_spawn_projectile dash_damage dash_min_range dash_max_range dash_cooldown
shield_hitpoints shield_die_pushback damage_reduction hit_speed_multiplier speed_multiplier
spawn_speed_multiplier invisible remove_on_attack remove_on_hit ignore_push_back
buff buff_type buff_on_damage buff_on_damage_time starting_buff starting_buff_time
buff_time buff_number life_duration life_duration_increase_per_level
hit_frequency damage_per_second heal_per_second damage_multiplier clone level_increase
enable_stacking chained_buff chained_buff_time morph_character morph_target spawn_object
spawn_area_effect_object death_spell pushback pushback_all gravity homing aoe_to_air aoe_to_ground
hits_air hits_ground only_enemies only_own_troops no_effect_to_crown_towers
mana_collect_amount mana_generate_time_ms mana_generate_limit mana_on_death mana_on_death_for_opponent
target_to_edge retarget_each_tick retarget_after_attack burst burst_delay
variable_damage_time1 variable_damage_time2 variable_damage2 variable_damage3
hitpoints_per_level damage_per_level dps_per_level'''.split())

def public_url(filename):
    return f'https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{ARCHIVE_COMMIT}/docs/json/{filename}'

def fact_subset(name, value):
    if name == 'cards_i18n':
        return [{'id': row['id'], 'key': row['key'],
                 'name_ko': row.get('_lang', {}).get('name', {}).get('kr'),
                 'name_en': row.get('_lang', {}).get('name', {}).get('en')}
                for row in value]
    if name == 'cards':
        return [{k: v for k, v in row.items() if k in CARD_FIELDS} for row in value]
    if name == 'rarities':
        return [{k: v for k, v in row.items() if k in RARITY_FIELDS} for row in value]
    return {category: [{k: v for k, v in row.items() if k in STAT_FIELDS} for row in rows]
            for category, rows in value.items()}
