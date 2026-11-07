// Vercel 서버리스: 브라우저에서 카카오 책 검색을 부를 때 키를 숨기는 프록시 (재고에 새 제목이 생겼을 때의 보충용)
// 환경변수 KAKAO_REST_KEY (Vercel Settings > Environment Variables)
export default async function handler(req, res) {
  const key = process.env.KAKAO_REST_KEY
  if (!key) return res.status(500).json({ error: 'no key' })
  const q = String(req.query.query || '').slice(0, 100)
  const target = req.query.target === 'isbn' ? 'isbn' : 'title'
  if (!q) return res.status(400).json({ error: 'no query' })
  try {
    const r = await fetch(`https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(q)}&target=${target}&size=5`, { headers: { Authorization: `KakaoAK ${key}` } })
    const j = await r.json()
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    return res.status(200).json(j)
  } catch (e) { return res.status(502).json({ error: 'kakao failed' }) }
}
