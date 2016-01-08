
export NODE_ENV=development

ignore="-i lib/static/scripts/app.js  -i lib/app.js -i lib/client.js server.js"

nodemon $ignore --harmony_shipping server.js
