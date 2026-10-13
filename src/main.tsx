// @ts-ignore
import SwaggerUIBundle from 'swagger-ui-dist/swagger-ui-bundle.js';
// @ts-ignore
import SwaggerUIStandalonePreset from 'swagger-ui-dist/swagger-ui-standalone-preset.js';
import 'swagger-ui-dist/swagger-ui.css';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  rootElement.id = 'swagger-ui';
}

SwaggerUIBundle({
  url: '/swagger/v1/swagger.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  presets: [
    SwaggerUIBundle.presets.apis,
    SwaggerUIStandalonePreset,
  ],
  layout: 'StandaloneLayout',
  docExpansion: 'list',
  defaultModelsExpandDepth: 1,
  showExtensions: true,
  showCommonExtensions: true,
});
