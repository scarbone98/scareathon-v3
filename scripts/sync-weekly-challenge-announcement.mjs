const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function strapiUrl(path, params = null) {
  const baseUrl = requireEnv('STRAPI_URL').replace(/\/$/, '');
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

async function strapiRequest(path, { method = 'GET', body = null, params = null } = {}) {
  const response = await fetch(strapiUrl(path, params), {
    method,
    headers: {
      Authorization: `Bearer ${requireEnv('STRAPI_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || `Strapi returned ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.path = path;
    throw error;
  }

  return payload;
}

function isStrapiNotFound(error) {
  return error?.statusCode === 404;
}

function getFields(entry) {
  return entry?.attributes ? { ...entry.attributes, id: entry.id, documentId: entry.documentId } : entry;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isActiveChallenge(entry, date = new Date()) {
  const fields = getFields(entry);
  if (!fields) return false;

  const startsAt = toDate(fields.startsAt || fields.StartsAt || fields.startDate);
  const endsAt = toDate(fields.endsAt || fields.EndsAt || fields.endDate);
  const customStatus = fields.status || fields.Status || (fields.publishedAt ? 'published' : 'draft');
  const isPublished = customStatus === 'published';

  return isPublished &&
    fields.autoAnnouncementEnabled !== false &&
    !fields.announcementPostDocumentId &&
    (!startsAt || startsAt.getTime() <= date.getTime()) &&
    (!endsAt || endsAt.getTime() >= date.getTime());
}

function paragraph(text) {
  return {
    type: 'paragraph',
    children: [{ type: 'text', text }],
  };
}

function formatChallengeTarget({ verificationType, gameName, metricName, targetMetricValue, comparisonOperator }) {
  if (
    verificationType !== 'arcade_score' &&
    verificationType !== 'game_score'
  ) {
    return null;
  }

  if (!gameName || !Number.isFinite(targetMetricValue)) {
    return null;
  }

  const metric = metricName || 'score';
  const action = metric === 'score' ? 'Score' : `Get ${metric}`;
  const target = targetMetricValue.toLocaleString();

  if (comparisonOperator === '>') return `${action} more than ${target} in ${gameName}.`;
  if (comparisonOperator === '<=') return `${action} ${target} or less in ${gameName}.`;
  if (comparisonOperator === '<') return `${action} under ${target} in ${gameName}.`;
  if (comparisonOperator === '=') return `${action} exactly ${target} in ${gameName}.`;
  return `${action} at least ${target} in ${gameName}.`;
}

export function buildAnnouncementPost(challenge) {
  const fields = getFields(challenge);
  const title = fields.title || fields.Title || fields.name || fields.Name;
  const summary = fields.summary || fields.Summary || fields.description || fields.Description;
  const rewardCoins = Number(fields.rewardCoins || fields.RewardCoins || fields.coinReward || 0);
  const points = Number(fields.points || fields.Points || 1);
  const verificationType = fields.verificationType || fields.VerificationType || fields.completionType || fields.CompletionType;
  const gameName = fields.gameName || fields.GameName || fields.game || fields.Game;
  const metricName = fields.metricName || fields.MetricName || 'score';
  const targetMetricValue = Number(fields.targetMetricValue || fields.TargetMetricValue || fields.targetScore || fields.TargetScore);
  const comparisonOperator = fields.comparisonOperator || fields.ComparisonOperator || '>=';
  const content = fields.content || fields.Content || [];
  const body = Array.isArray(content) && content.length > 0
    ? [...content]
    : [paragraph(summary || 'A new weekly challenge is live.')];

  body.push(paragraph(`Worth ${Number.isFinite(points) && points > 0 ? points : 1} weekly point.`));

  const challengeTarget = formatChallengeTarget({
    verificationType,
    gameName,
    metricName,
    targetMetricValue,
    comparisonOperator,
  });

  if (challengeTarget) {
    body.push(paragraph(`Verified automatically: ${challengeTarget}`));
  }

  if (Number.isFinite(rewardCoins) && rewardCoins > 0) {
    body.push(paragraph(`Complete the challenge and claim ${rewardCoins} coins for avatar shop rewards.`));
  }

  return {
    Title: `Weekly Challenge: ${title}`,
    Content: body,
  };
}

async function findActiveChallenge(date = new Date()) {
  let payload;
  try {
    payload = await strapiRequest('/api/weekly-challenges', {
      params: {
        populate: '*',
        'sort[0]': 'startsAt:desc',
        'pagination[limit]': '25',
        'filters[startsAt][$lte]': date.toISOString(),
        'filters[endsAt][$gte]': date.toISOString(),
      },
    });
  } catch (error) {
    if (isStrapiNotFound(error)) {
      return null;
    }
    throw error;
  }

  return (payload?.data || []).find((entry) => isActiveChallenge(entry, date)) || null;
}

async function createDraftPostForChallenge(challenge) {
  const postPayload = await strapiRequest('/api/posts', {
    method: 'POST',
    body: {
      data: buildAnnouncementPost(challenge),
    },
  });
  return postPayload?.data;
}

async function linkAnnouncementToChallenge(challenge, post) {
  const fields = getFields(challenge);
  const documentId = fields.documentId;
  if (!documentId) {
    throw new Error('Weekly challenge is missing documentId');
  }

  await strapiRequest(`/api/weekly-challenges/${encodeURIComponent(documentId)}`, {
    method: 'PUT',
    body: {
      data: {
        announcementPostDocumentId: post.documentId || String(post.id),
      },
    },
  });
}

export async function run({ date = new Date(), dryRun = false } = {}) {
  const challenge = await findActiveChallenge(date);
  if (!challenge) {
    console.log('No active weekly challenge needs a draft announcement.');
    return { created: false, reason: 'no_active_challenge' };
  }

  const fields = getFields(challenge);
  const draftPost = buildAnnouncementPost(challenge);
  if (dryRun) {
    console.log(JSON.stringify({ challenge: fields.documentId, draftPost }, null, 2));
    return { created: false, reason: 'dry_run' };
  }

  const post = await createDraftPostForChallenge(challenge);
  await linkAnnouncementToChallenge(challenge, post);

  console.log(`Created draft announcement ${post.documentId || post.id} for weekly challenge ${fields.documentId}.`);
  return { created: true, challengeDocumentId: fields.documentId, postDocumentId: post.documentId || String(post.id) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.TZ) {
    process.env.TZ = DEFAULT_TIME_ZONE;
  }

  run({ dryRun: process.argv.includes('--dry-run') }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
