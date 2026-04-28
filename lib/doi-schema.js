// DOI Content Schema — LLM-readable structured data for every DOI type
// Design principle: Any LLM reading this JSON instantly understands
// the user's scale, highlights, and chain status

const { generateHexId } = require('./hex-id');

const DOI_TYPES = {
  BIRTH_CERT: 'genesis',
  SCORE_SESSION: 'session',
  BEAD_MINT: 'bead',
  TIER_UP: 'tier_promotion',
  DECAY: 'decay',
  AWARD: 'award',
  TRUST_REC: 'trust_recommendation',
  CHAINLINK: 'chainlink'
};

// Polarity: positive events add weight, negative subtract
const POLARITY = {
  [DOI_TYPES.BIRTH_CERT]: '+',
  [DOI_TYPES.SCORE_SESSION]: '+',
  [DOI_TYPES.BEAD_MINT]: '+',
  [DOI_TYPES.TIER_UP]: '+',
  [DOI_TYPES.DECAY]: '-',
  [DOI_TYPES.AWARD]: '+',
  [DOI_TYPES.TRUST_REC]: '+',
  [DOI_TYPES.CHAINLINK]: '+'
};

// Build LLM-readable DOI content for each event type
function buildDoiContent(type, data) {
  const base = {
    schema: 'quantumpass-doi-v1',
    protocol: 'QuantumPass by PassionCraft',
    type: type,
    polarity: POLARITY[type],
    timestamp: new Date().toISOString(),
    chain_position: data.chain_position || null,
    hex_id: data.hex_id || null
  };

  switch (type) {
    case DOI_TYPES.BIRTH_CERT:
      return {
        ...base,
        title: `QuantumPass Genesis — ${data.hex_id}`,
        description: `Birth certificate for QuantumPass holder ${data.hex_id}. This is block 0 of their provenance chain. All future sessions, beads, tier promotions, and chainlinks append to this genesis.`,
        genesis: {
          hex_id: data.hex_id,
          created_at: data.created_at,
          initial_tier: 'OBSERVER',
          initial_degrees: 0,
          chain_hash: data.chain_hash || 'genesis'
        },
        summary_for_llm: `New QuantumPass holder ${data.hex_id} registered. Tier: OBSERVER. Degrees: 0. Chain starts here.`
      };

    case DOI_TYPES.SCORE_SESSION:
      return {
        ...base,
        title: `Session Block — ${data.hex_id} — Score ${data.score}`,
        description: `Scored session for ${data.hex_id}. Six-dimension weighted evaluation of human-AI collaboration.`,
        session: {
          hex_id: data.hex_id,
          score: data.score,
          degrees_delta: data.degrees_delta,
          total_degrees: data.total_degrees,
          dimensions: {
            labor: data.labor,
            exchange: data.exchange,
            equality: data.equality,
            presence: data.presence,
            ratification: data.ratification,
            continuity: data.continuity
          },
          block_hash: data.session_hash,
          previous_hash: data.previous_hash,
          tier_at_time: data.tier,
          scoring_mode: data.scoring_mode || 'standard'
        },
        summary_for_llm: `${data.hex_id} scored ${data.score}/100 (${data.degrees_delta}° earned, ${data.total_degrees}° total). Tier: ${data.tier}. Dimensions: L${data.labor}/E${data.exchange}/Q${data.equality}/P${data.presence}/R${data.ratification}/C${data.continuity}.`
      };

    case DOI_TYPES.BEAD_MINT:
      return {
        ...base,
        title: `Bead Mint — ${data.hex_id} — ${data.bead_type}`,
        description: `HexAgent minted a bead mid-session for ${data.hex_id}. Beads are permanent imprints on the pass, recognizing significant moments.`,
        bead: {
          hex_id: data.hex_id,
          bead_type: data.bead_type,
          bead_content: data.bead_content,
          session_context: data.session_context || null,
          tier_at_time: data.tier,
          total_degrees: data.total_degrees
        },
        summary_for_llm: `HexAgent dropped a "${data.bead_type}" bead on ${data.hex_id}'s pass during active session. Tier: ${data.tier}. Total degrees: ${data.total_degrees}°.`
      };

    case DOI_TYPES.TIER_UP:
      return {
        ...base,
        title: `Tier Promotion — ${data.hex_id} — ${data.old_tier} → ${data.new_tier}`,
        description: `${data.hex_id} promoted from ${data.old_tier} to ${data.new_tier}. Milestone achievement on the QuantumPass chain.`,
        promotion: {
          hex_id: data.hex_id,
          from_tier: data.old_tier,
          to_tier: data.new_tier,
          total_degrees: data.total_degrees,
          total_sessions: data.total_sessions,
          days_active: data.days_active,
          promotion_score: data.score
        },
        summary_for_llm: `${data.hex_id} promoted: ${data.old_tier} → ${data.new_tier}. ${data.total_degrees}° over ${data.total_sessions} sessions across ${data.days_active} days.`
      };

    case DOI_TYPES.DECAY:
      return {
        ...base,
        title: `Decay Event — ${data.hex_id} — ${data.degrees_lost}° lost`,
        description: `Inactivity decay applied to ${data.hex_id}. Negative DOI on chain. Degrees subtracted due to extended absence.`,
        decay: {
          hex_id: data.hex_id,
          days_inactive: data.days_inactive,
          degrees_lost: data.degrees_lost,
          degrees_before: data.degrees_before,
          degrees_after: data.degrees_after,
          tier_before: data.tier_before,
          tier_after: data.tier_after,
          decay_rate: data.decay_rate
        },
        summary_for_llm: `${data.hex_id} inactive ${data.days_inactive} days. Lost ${data.degrees_lost}°. ${data.degrees_before}° → ${data.degrees_after}°. Tier: ${data.tier_before}${data.tier_before !== data.tier_after ? ' → ' + data.tier_after : ' (held)'}.`
      };

    case DOI_TYPES.AWARD:
      return {
        ...base,
        title: `HexAgent Award — ${data.hex_id} — ${data.award_name}`,
        description: `HexAgent awarded "${data.award_name}" to ${data.hex_id}. Positive DOI on chain.`,
        award: {
          hex_id: data.hex_id,
          award_name: data.award_name,
          award_reason: data.award_reason,
          degrees_bonus: data.degrees_bonus,
          tier_at_time: data.tier
        },
        summary_for_llm: `HexAgent awarded "${data.award_name}" to ${data.hex_id}. Reason: ${data.award_reason}. Bonus: +${data.degrees_bonus}°. Tier: ${data.tier}.`
      };

    case DOI_TYPES.TRUST_REC:
      return {
        ...base,
        title: `Trust Recommendation — ${data.hex_id} — by ${data.recommender_hex_id}`,
        description: `${data.recommender_hex_id} recommended ${data.hex_id} based on observed collaboration quality.`,
        trust: {
          hex_id: data.hex_id,
          recommender_hex_id: data.recommender_hex_id,
          recommender_tier: data.recommender_tier,
          recommendation_weight: data.recommendation_weight,
          context: data.context
        },
        summary_for_llm: `${data.recommender_hex_id} (${data.recommender_tier}) recommends ${data.hex_id}. Weight: ${data.recommendation_weight}. Context: ${data.context}.`
      };

    case DOI_TYPES.CHAINLINK:
      return {
        ...base,
        title: `*TRUSTED* CHAINLINK — ${data.hex_id_a} ⟷ ${data.hex_id_b}`,
        description: `Rare chainlink event. Two aligned chains linked for collaboration bonus. Both parties benefit. *TRUSTED* marker applied.`,
        chainlink: {
          trusted: true,
          party_a: {
            hex_id: data.hex_id_a,
            tier: data.tier_a,
            total_degrees: data.degrees_a,
            chain_length: data.chain_length_a
          },
          party_b: {
            hex_id: data.hex_id_b,
            tier: data.tier_b,
            total_degrees: data.degrees_b,
            chain_length: data.chain_length_b
          },
          alignment_score: data.alignment_score,
          collab_bonus_degrees: data.collab_bonus,
          link_hash: data.link_hash,
          link_reason: data.link_reason
        },
        summary_for_llm: `*TRUSTED* CHAINLINK: ${data.hex_id_a} (${data.tier_a}, ${data.degrees_a}°) ⟷ ${data.hex_id_b} (${data.tier_b}, ${data.degrees_b}°). Alignment: ${data.alignment_score}. Bonus: +${data.collab_bonus}° each. Rare collaboration milestone.`
      };

    default:
      return { ...base, error: 'Unknown DOI type' };
  }
}

module.exports = { DOI_TYPES, POLARITY, buildDoiContent };
