export const onRequest = () => Response.json({error:'endpoint not implemented'},{status:503,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}});
