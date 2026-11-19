
export async function onRequestPost({ env }) {
  try {
    const result = await env.DB
      .prepare(`
        UPDATE visitor_counter
        SET count = count + 1
        WHERE id = 1
        RETURNING count
      `)
      .first();

    if (!result) {
      throw new Error("カウンターが見つかりません。");
    }

    return Response.json({
      success: true,
      count: result.count
    });

  } catch (error) {
    return Response.json(
      { error: "カウンターの取得に失敗しました。" },
      { status: 500 }
    );
  }
}
