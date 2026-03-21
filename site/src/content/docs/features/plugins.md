---
title: Plugins
description: Plugin registry, manifest format, lifecycle management, and SKILL.md discovery.
sidebar:
  order: 9
---

The `@openaios/plugins` package provides a **plugin system** for extending openAIOS with custom tools, channels, and hooks.

## Plugin Discovery

Plugins are discovered from three locations (in order):

1. `./plugins/` — project-local plugins
2. `~/.openaios/plugins/` — user-global plugins
3. Custom directories via config

Each subdirectory containing a `plugin.json` is treated as a plugin.

## Plugin Manifest

Every plugin needs a `plugin.json`:

```json
{
  "name": "weather",
  "displayName": "Weather Plugin",
  "version": "1.0.0",
  "description": "Current weather and forecasts",
  "author": "team",
  "main": "dist/index.js",
  "provides": {
    "tools": ["weather_current", "weather_forecast"],
    "channels": [],
    "hooks": []
  }
}
```

### Required fields

| Field | Description |
|-------|-------------|
| `name` | Unique identifier (lowercase, hyphens) |
| `displayName` | Human-readable name |
| `version` | Semver version string |
| `description` | Short description |

### Optional fields

| Field | Default | Description |
|-------|---------|-------------|
| `main` | `index.js` | Entry point module path |
| `author` | — | Plugin author |
| `provides.tools` | `[]` | Tool names this plugin registers |
| `provides.channels` | `[]` | Channel types this plugin provides |
| `provides.hooks` | `[]` | Lifecycle hooks this plugin uses |

## Plugin Lifecycle

Plugins follow a state machine:

```
discovered → installed → enabled ↔ disabled
                ↓          ↓
              error      error
```

- **Discovered** — found on disk, manifest validated
- **Installed** — dependencies resolved
- **Enabled** — active and providing tools/channels
- **Disabled** — temporarily inactive
- **Error** — failed to load or crashed

## SKILL.md Discovery

Skills are markdown files that get injected into agent system prompts. Place a `SKILL.md` file in any subdirectory of the skills directory:

```
~/.openaios/skills/
  coding/
    SKILL.md          # Injected when agent has "coding" in skills list
  research/
    SKILL.md
```

Reference skills in agent config:

```yaml
agents:
  - name: developer
    skills:
      - coding
      - research
```

The content of each `SKILL.md` is appended to the agent's system prompt at startup.

## Using the Plugin Registry

```typescript
import { PluginRegistry } from '@openaios/plugins'

const registry = new PluginRegistry({
  dirs: ['./plugins', '/custom/plugins'],
})

await registry.discoverAll()
console.log(registry.list())  // all discovered plugins

registry.enable('weather')
console.log(registry.enabled())  // ['weather']
```
