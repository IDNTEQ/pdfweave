import type { Plugin, Plugins } from '@pdfweave/common';
import * as schemas from '@pdfweave/schemas';

function isPlugin(value: unknown): value is Plugin {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const plugin = value as Partial<Plugin> & {
    propPanel?: { defaultSchema?: { type?: unknown } };
  };

  return (
    typeof plugin.pdf === 'function' &&
    typeof plugin.ui === 'function' &&
    typeof plugin.propPanel === 'object' &&
    plugin.propPanel !== null &&
    typeof plugin.propPanel.defaultSchema === 'object' &&
    plugin.propPanel.defaultSchema !== null &&
    typeof plugin.propPanel.defaultSchema.type === 'string'
  );
}

function collectPluginsByType(value: unknown, plugins: Plugins, seen: WeakSet<object>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (isPlugin(value)) {
    const type = value.propPanel.defaultSchema.type;
    if (!(type in plugins)) {
      plugins[type] = value;
    }
    return;
  }

  for (const child of Object.values(value)) {
    collectPluginsByType(child, plugins, seen);
  }
}

function buildSchemaPlugins(): Plugins {
  const plugins: Plugins = {};
  collectPluginsByType(schemas, plugins, new WeakSet<object>());
  return plugins;
}

export const schemaPlugins = buildSchemaPlugins();
export const schemaTypes = new Set(Object.keys(schemaPlugins));
