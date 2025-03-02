// auto-generated
{{#each routers}}
import { {{view.viewName}} } from '{{view.importPath}}'
{{/each}}

{{#each routers}}
@Builder
function {{view.functionName}}Builder({{view.param}}) {
  {{#if view.param}}
    {{#if view.paramName}}
    {{view.viewName}}({ {{view.paramName}}: param });
    {{else}}
    {{view.viewName}}({routeParams: param});
    {{/if}}
  {{else}}
    {{view.viewName}}();
  {{/if}}
}
