// auto-generated
{{#each routers}}
import { {{view.componentName}} } from '{{view.importPath}}'
{{/each}}

{{#each routers}}
@Builder
{{#if view.hasParam}}
function {{view.componentName}}Builder(param: ESObject) {
{{else}}
function {{view.componentName}}Builder() {
{{/if}}
  {{#if view.hasParam}}
    {{#if view.paramName}}
    {{view.componentName}}({ {{view.paramName}}: param });
    {{else}}
    {{view.componentName}}({routeParams: param});
    {{/if}}
  {{else}}
    {{view.componentName}}();
  {{/if}}
}
{{/each}}
