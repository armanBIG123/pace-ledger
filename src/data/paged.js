// Supabase sends at most a set number of rows per request (1,000 unless the
// project's "Max rows" setting says otherwise), and anything past that is
// silently left off. Lists that can grow past it (everyone's appointments,
// prospects, intake forms…) load through selectAll, which keeps asking for
// the next page until it has every row.
//
// build(opts): returns a fresh query each time it's called, passing opts to
// its select(), with its filters and a stable order (end the order with a
// unique column, like id, so rows can't swap between pages). Returns
// { data, error } like a normal Supabase call.
export async function selectAll(build, { max = 100000 } = {}) {
  // The first request also asks how many rows there are in total; the
  // server's page size is however many it sends back.
  const first = await build({ count: 'exact' }).range(0, 999);
  if (first.error) return { data: null, error: first.error };
  const out = [...(first.data || [])];
  const total = typeof first.count === 'number' ? Math.min(first.count, max) : null;
  const step = out.length;
  if (!step || total === null || out.length >= total) return { data: out, error: null };
  while (out.length < total) {
    const { data, error } = await build().range(out.length, out.length + step - 1);
    if (error) { console.error(error); break; } // keep what came back
    if (!data || !data.length) break;
    out.push(...data);
  }
  return { data: out, error: null };
}
