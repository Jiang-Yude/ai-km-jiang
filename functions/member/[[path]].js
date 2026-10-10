export const onRequest = () => new Response('會員功能尚未啟用',{status:503,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
