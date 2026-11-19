
async function hashIp(ip, secret) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(ip)
  );

  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestGet({ request, env }) {
  const token = request.headers.get("Authorization");

  if (
    token &&
    (!env.ADMIN_TOKEN || token !== `Bearer ${env.ADMIN_TOKEN}`)
  ) {
    return Response.json(
      { error: "認証に失敗しました。" },
      { status: 401 }
    );
  }

  const { results } = await env.DB
    .prepare(
      "SELECT id, name, message, created_at FROM posts ORDER BY id DESC LIMIT 100"
    )
    .all();

  return Response.json(results);
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    const name = String(data.name || "").trim();
    const message = String(data.message || "").trim();

    if (!name || !message) {
      return Response.json(
        { error: "名前とメッセージを入力してね！" },
        { status: 400 }
      );
    }

    if (name.length > 30 || message.length > 500) {
      return Response.json(
        { error: "名前は30文字、メッセージは500文字以内だよ！" },
        { status: 400 }
      );
    }

    if (!env.ADMIN_TOKEN) {
      return Response.json(
        { error: "サーバー設定エラーです。" },
        { status: 500 }
      );
    }

    const ip = request.headers.get("CF-Connecting-IP");

    if (!ip) {
      return Response.json(
        { error: "接続情報を確認できませんでした。" },
        { status: 400 }
      );
    }

    const ipHash = await hashIp(ip, env.ADMIN_TOKEN);
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 60;

    const rate = await env.DB
      .prepare(`
        INSERT INTO post_rate_limits (ip_hash, window_start, count)
        VALUES (?, ?, 1)
        ON CONFLICT(ip_hash) DO UPDATE SET
          window_start = CASE
            WHEN post_rate_limits.window_start <= ?
            THEN excluded.window_start
            ELSE post_rate_limits.window_start
          END,
          count = CASE
            WHEN post_rate_limits.window_start <= ?
            THEN 1
            ELSE post_rate_limits.count + 1
          END
        RETURNING count
      `)
      .bind(ipHash, now, cutoff, cutoff)
      .first();

    if (!rate || rate.count > 3) {
      return Response.json(
        { error: "投稿は1分間に3回までだよ！少し待ってね ♡" },
        { status: 429 }
      );
    }

    await env.DB
      .prepare("INSERT INTO posts (name, message) VALUES (?, ?)")
      .bind(name, message)
      .run();

    return Response.json({ success: true });

  } catch (error) {
    return Response.json(
      { error: "投稿に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function onRequestDelete({ request, env }) {
  const token = request.headers.get("Authorization");

  if (!env.ADMIN_TOKEN || token !== `Bearer ${env.ADMIN_TOKEN}`) {
    return Response.json(
      { error: "認証に失敗しました。" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { error: "投稿番号が不正です。" },
      { status: 400 }
    );
  }

  const result = await env.DB
    .prepare("DELETE FROM posts WHERE id = ?")
    .bind(id)
    .run();

  if (result.meta.changes === 0) {
    return Response.json(
      { error: "投稿が見つかりません。" },
      { status: 404 }
    );
  }

  return Response.json({ success: true });
}
