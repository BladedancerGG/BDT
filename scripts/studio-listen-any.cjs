// Prisma Studio 7 lie son serveur en dur sur 127.0.0.1 (aucune option --hostname).
// Depuis le conteneur, la publication de port Docker ne voit alors rien : http://localhost:5555
// sur l'hôte tombe sur un port fermé. On réécrit l'hôte d'écoute vers 0.0.0.0 au chargement,
// via NODE_OPTIONS=--require (cf. le script db:studio).
const http = require('node:http')

const listen = http.Server.prototype.listen
http.Server.prototype.listen = function (...args) {
  if (args[0] && typeof args[0] === 'object' && args[0].host === '127.0.0.1') {
    args[0] = { ...args[0], host: '0.0.0.0' }
  } else if (typeof args[1] === 'string' && args[1] === '127.0.0.1') {
    args[1] = '0.0.0.0'
  }
  return listen.apply(this, args)
}
