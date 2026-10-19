'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const openapiPath = path.join(projectRoot, 'openapi.json');
const outputDirectory = path.join(projectRoot, 'postman');
const outputPath = path.join(outputDirectory, 'flower-life.postman_collection.json');
const document = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

const methods = ['get', 'post', 'put', 'patch', 'delete'];

function resolveSchema(schema = {}) {
  if (!schema.$ref) return schema;
  const segments = schema.$ref.replace(/^#\//, '').split('/');
  return segments.reduce((value, segment) => value?.[segment], document) || {};
}

function sampleValue(schema = {}, propertyName = '') {
  const resolved = resolveSchema(schema);
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum?.length) return resolved.enum[0];
  if (resolved.type === 'array') return [sampleValue(resolved.items)];
  if (resolved.type === 'object' || resolved.properties) {
    return Object.fromEntries(
      Object.entries(resolved.properties || {}).map(([key, value]) => [key, sampleValue(value, key)])
    );
  }
  if (resolved.type === 'boolean') return false;
  if (resolved.type === 'integer' || resolved.type === 'number') return resolved.minimum || 1;
  if (propertyName.toLowerCase().includes('email')) return 'admin@hexschool.com';
  if (propertyName.toLowerCase().includes('password')) return '12345678';
  return `<${propertyName || resolved.type || 'value'}>`;
}

function requestBodyFor(apiPath, method, operation) {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  if (!schema) return undefined;

  const body = sampleValue(schema);
  if (apiPath === '/api/auth/login' && method === 'post') {
    body.email = 'admin@hexschool.com';
    body.password = '12345678';
  }
  if (apiPath === '/api/auth/register' && method === 'post') {
    body.name = 'Postman 測試會員';
    body.email = 'postman@example.com';
    body.password = 'password123';
  }
  if (apiPath === '/api/cart' && method === 'post') {
    body.productId = '{{productId}}';
    body.quantity = 1;
  }
  if (apiPath === '/api/orders' && method === 'post') {
    Object.assign(body, {
      recipientName: 'Postman 測試收件人',
      recipientEmail: 'postman-recipient@example.com',
      recipientAddress: '台北市測試路 100 號',
      deliveryType: 'home_delivery',
      isRemoteArea: false,
      isSameDayExpress: false,
    });
  }

  return {
    mode: 'raw',
    raw: JSON.stringify(body, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function postmanUrl(apiPath, parameters = []) {
  let value = apiPath;
  const variables = [];
  const declaredPathNames = parameters.filter(item => item.in === 'path').map(item => item.name);
  const discoveredPathNames = [...apiPath.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);

  for (const name of new Set([...declaredPathNames, ...discoveredPathNames])) {
    value = value.replaceAll(`{${name}}`, `{{${name}}}`);
    variables.push({ key: name, value: `<${name}>` });
  }

  return {
    raw: `{{baseUrl}}${value}`,
    host: ['{{baseUrl}}'],
    path: value.split('/').filter(Boolean),
    variable: variables,
  };
}

function loginTestScript() {
  return [{
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        'pm.test("登入成功並儲存 JWT", function () {',
        '  pm.response.to.have.status(200);',
        '  const body = pm.response.json();',
        '  pm.expect(body.data.token).to.be.a("string").and.not.empty;',
        '  pm.collectionVariables.set("token", body.data.token);',
        '});',
      ],
    },
  }];
}

function buildRequest(apiPath, method, operation, pathItem) {
  const parameters = [...(pathItem.parameters || []), ...(operation.parameters || [])];
  const usesBearer = (operation.security || []).some(rule => 'bearerAuth' in rule);
  const usesSession = (operation.security || []).some(rule => 'sessionId' in rule);
  const headers = [];
  if (usesSession) headers.push({ key: 'X-Session-Id', value: '{{sessionId}}', type: 'text' });

  const body = requestBodyFor(apiPath, method, operation);
  if (body) headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });

  const item = {
    name: operation.summary || `${method.toUpperCase()} ${apiPath}`,
    request: {
      method: method.toUpperCase(),
      header: headers,
      url: postmanUrl(apiPath, parameters),
      description: operation.description || '',
    },
    response: [],
  };

  if (usesBearer) {
    item.request.auth = {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
    };
  }
  if (body) item.request.body = body;
  if (apiPath === '/api/auth/login' && method === 'post') item.event = loginTestScript();
  return item;
}

const folders = new Map();
for (const [apiPath, pathItem] of Object.entries(document.paths || {})) {
  for (const method of methods) {
    const operation = pathItem[method];
    if (!operation) continue;
    const tag = operation.tags?.[0] || 'Other';
    if (!folders.has(tag)) folders.set(tag, []);
    folders.get(tag).push(buildRequest(apiPath, method, operation, pathItem));
  }
}

const collection = {
  info: {
    _postman_id: 'e0871b2d-48d0-4f83-9af2-7e2eab82c001',
    name: `${document.info?.title || 'Flower Life API'} Collection`,
    description: '由專案 openapi.json 自動產生；請先執行登入請求以保存 JWT。',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3001', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'sessionId', value: 'postman-flower-life-session', type: 'string' },
    { key: 'productId', value: '', type: 'string' },
  ],
  item: [...folders.entries()].map(([name, item]) => ({ name, item })),
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
JSON.parse(fs.readFileSync(outputPath, 'utf8'));
console.log(`Postman Collection generated: ${path.relative(projectRoot, outputPath)}`);
