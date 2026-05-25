# Design spec — Phase 4.5 V2 (refonte profonde)

**Author:** `redesign` (Jacquouille bus) — 2026-05-25
**Target implementer:** `jacqline` agent
**Branch suggéré :** `feat/phase-4-5-design-v2`
**Supersedes :** `tasks/design-spec-phase-4-5.md` (V1) — V1 était une passe cosmétique trop superficielle.

## Pourquoi une V2

V1 audit était basé sur le SVG thumbnail visible dans `<head>` de `docs/mockup.html`. Ce thumbnail est un placeholder de loading — pas le rendu React du mockup. Erreur de méthode.

**V2 method :** j'ai extrait le bundler manifest de `docs/mockup.html` (script `__bundler/manifest`, base64-gzipped). Le mockup est un set de modules React complets avec design tokens, structures DOM exactes, CSS embedded. Sources déballées :

- `1aa80c2c-*.js` — `App` + `TitleBar` + `SystemMenu` + resizers
- `2f05260f-*.js` — `Sidebar` (projects + sessions tree)
- `1d632c51-*.js` — `I` icon set (custom inline SVGs, ~30 icons)
- `cc6c64df-*.js` — Demo data (PROJECTS shape + TRANSCRIPT)
- `4e6ebf09-*.js` — `Inspector` multi-tab + `PanelChooser` + Panels
- `8a53e210-*.js` — `CustomizeWindow` (global settings, 6 sections)
- `6e91a44c-*.js` — `ProjectConfigWindow` (per-project, 6 sections)
- `a010fbb1-*.js` — `SessionDialog` (new + edit) with agent picker
- Template `_template.html` — full app CSS (1908 lines) embedded between `<style>` tags

Toutes les classes CSS, tokens, structures sont donc connues exactement. Cette spec V2 est dérivée 1:1 des sources mockup.

## Phases d'implémentation (lecture obligatoire)

Le scope total = ~80% de refonte UI + un refactor backend non-trivial. **7 phases, 1 PR par phase, chacune shippable indépendamment.** Ordre conçu pour livrer un palier visible à chaque merge et minimiser les dépendances entre PRs.

| # | Phase | PR branch | Visible milestone | Dépend de | Risque |
|---|---|---|---|---|---|
| **A** | Backend multi-sessions | `feat/phase-4-5-A-backend-sessions` | Aucun changement UI ; mais `session_list_by_project` retourne N sessions au lieu de 1 | — | Élevé (SQL migration + concurrence PTY) |
| **B** | Foundation visuelle | `feat/phase-4-5-B-foundation` | Couleurs warmer (h=60), nouvelles icônes partout (set custom), brand mark conic-gradient (vs SVG L) | — | Faible |
| **C** | TitleBar + AppShell grid | `feat/phase-4-5-C-titlebar` | Titlebar Tauri OS remplacée par TitleBar custom (drag + brand + min/max/close) ; grid app-frame | B | Moyen (Tauri decorations, drag region) |
| **D** | Sidebar tree | `feat/phase-4-5-D-sidebar` | Sidebar = 2 boutons top (Nouveau projet + Customize), heading "PROJETS", tree expandable avec sessions sub-tree + status dots + kebab menu | A, B, C | Élevé (le plus de code visuel) |
| **E** | MainPane + Statusbar + Terminal theme | `feat/phase-4-5-E-main` | Terminal area = bg-terminal plus sombre, header top supprimé, statusbar bas (branch / cwd / model / session + Cloud toggle + iconbtns) | B, C | Faible |
| **F** | Customize + ProjectConfig + SessionDialog | `feat/phase-4-5-F-modals` | 3 nouvelles modals : Customize (6 sections), ProjectConfig (kebab projet, 6 sections), SessionDialog (new + edit avec agent picker grid) ; suppression Settings + About dialogs | B, D | Moyen (volume, sections internes peuvent être placeholder) |
| **G** | Inspector multi-tab + polish | `feat/phase-4-5-G-inspector-polish` | Inspector multi-tab dynamique (tabs CLAUDE.md / Browser / Tasks / Diff via PanelChooser cinematic) + sidebar collapsed icon rail + resizers drag + SystemMenu CPU% popover | B, C, E | Moyen (Inspector volumineux, mais isolable du reste) |

**Justifications clés :**

- **Phase A doit shipper avant D** : Sidebar tree affiche les sessions par projet ; sans le backend N-sessions, la sidebar n'a rien à itérer. (Workaround : mock data dans Sidebar derrière `import.meta.env.DEV`, mais cassera dès qu'on enlève le flag.)
- **Phase B doit shipper avant C/D/E/F/G** : tous les composants visuels suivants dépendent des nouveaux design tokens + icons + brand mark. Sans B, on devrait re-toucher les composants ensuite.
- **Phase C avant D** : le TitleBar contient le toggle sidebar (panel_left/panel_right icon button) qui pilote `data-sb` sur `app-frame`. Sidebar a besoin de ce contrat pour son mode collapsed (phase G).
- **Phase D avant F** : SessionDialog est déclenché depuis Sidebar (`session-new` button + kebab "Nouvelle session"), ProjectConfig depuis Sidebar (kebab "Configurer le projet…"), Customize depuis Sidebar (sb-top button). Sidebar doit exister.
- **Phase G en dernier** : Inspector multi-tab + collapsed mode + resizers + SystemMenu sont les features les plus riches mais aussi les plus isolées (n'affectent pas le reste). Si on time-out sur la fin, on peut shipper sans G et avoir déjà 95% du mockup.

**Mapping phase → fichiers touchés :**

### Phase A — Backend multi-sessions
- **À modifier** : `src-tauri/src/sessions.rs` (ou wherever PtyManager vit), `src-tauri/migrations/*.sql`, `src/lib/api/sessions.ts`, `src/stores/sessions.ts`, `src/types/session.ts`
- **À créer** : nouvelle migration SQL pour ajouter `name`, `claude_id`, `status` à `sessions` table
- **Tests** : `cargo test session_list_by_project / session_create / session_kill` + vitest sur stores si applicable
- **Notes** : auto-spawn devient opt-in. Voir section "Sessions data model" plus bas pour le shape final.

### Phase B — Foundation visuelle
- **À modifier** : `src/index.css` (remplace `@theme` complet), `src/components/jacqline-mark.tsx` (devient `<span>` CSS-only), `package.json` (drop `lucide-react`)
- **À créer** : `src/components/icons.tsx` (export `I` avec ~30 icons), `src/styles/jacqline-mark.css` ou inline dans `index.css`
- **À update partout** : remplace les imports `lucide-react` par `import { I } from "@/components/icons"` ; remplace `<Plus />` par `<I.plus />`, `<Folder />` par `<I.folder />`, etc.
- **Tests visuels** : la couleur globale change (plus warm/light), les icones sont plus fines, mais layout structurel identique.

### Phase C — TitleBar + AppShell grid
- **À modifier** : `src-tauri/tauri.conf.json` (`"decorations": false`), `src/components/app-shell.tsx` (grid restructure)
- **À créer** : `src/components/title-bar.tsx`, `src/stores/ui.ts`, styles `.jq-app-frame` + `.jq-titlebar` + `.jq-tb-*` dans `src/index.css`
- **SystemMenu stub** : div placeholder en bas-droite du titlebar. Real impl arrive en phase G.

### Phase D — Sidebar tree
- **À renommer** : `src/components/projects-sidebar.tsx` → `src/components/sidebar.tsx`
- **À update** : tous les imports de `ProjectsSidebar` → `Sidebar` (probablement seulement `app-shell.tsx`)
- **À créer** : styles `.jq-sidebar / .jq-sb-* / .jq-project / .jq-project-row / .jq-sessions / .jq-session / .jq-session-* / .jq-kebab / .jq-context-menu / .jq-ctx-*`
- **À étendre** : `src/stores/projects.ts` (`activeSessionId` + setter), `src/stores/sessions.ts` (statusOverride pour toggle local).
- **Dépend de Phase A** : utilise `project.sessions[]` shape.

### Phase E — MainPane + Statusbar + Terminal theme
- **À modifier** : `src/components/main-pane.tsx` (drop header, ajoute Statusbar bottom), `src/components/terminal.tsx` (theme update, drop wrapper padding)
- **À créer** : `src/components/statusbar.tsx`, styles `.jq-content / .jq-xterm-wrap / .jq-statusbar / .jq-sb-cloud / .jq-iconbtn-sm`
- **Note xterm theme** : background du theme = `var(--color-bg-terminal)` (le wrapper aussi pour éviter le flash). Le store-cloud-toggle est local-only V2 ; backend hook arrive plus tard.

### Phase F — Modals (Customize + ProjectConfig + SessionDialog)
- **À créer** : `src/components/customize-window.tsx`, `src/components/project-config-window.tsx`, `src/components/session-dialog.tsx`, styles `.jq-cust-* / .jq-pc-* / .jq-ns-* / .jq-chooser-*`
- **À modifier** : `src/components/new-project-dialog.tsx` (restyle avec classes `jq-ns-*` pour cohérence chrome), `src/components/app-shell.tsx` (wire les modals + state)
- **À supprimer** : `src/components/settings-dialog.tsx`, `src/components/about-dialog.tsx`
- **Note** : sections internes de Customize peuvent être placeholder (juste les `CustHeader` avec empty list). Le shell modal (scrim + window + nav + content) est l'essentiel pour V2.

### Phase G — Inspector multi-tab + polish
- **À renommer** : `src/components/right-panel.tsx` → `src/components/inspector.tsx`
- **À créer** : `src/components/panel-chooser.tsx` (modal-like, tile grid cinematic) + 4 panel components (`panel-file.tsx`, `panel-browser.tsx`, `panel-tasks.tsx`, `panel-diff.tsx`)
- **À créer optionnel** : `src/components/inspector-resizer.tsx`, `src/components/sidebar-resizer.tsx`, `src/components/system-menu.tsx`
- **À update** : `src-tauri/src/system.rs` (commande `system_stats` retourne CPU/mem/disk/net), `src/lib/api/system.ts` bindings
- **Sidebar collapsed mode** : ajoute la CSS `.jq-app-frame[data-sb="collapsed"] .jq-sb-* / .jq-project-row / .jq-sessions { … }` du mockup (lignes 491-627 de `_app.css`)
- **Note** : phase la plus large mais aussi la plus isolée — peut être shippée bien après les autres ou même restée en backlog si time-up.

---

## Constat global

Les 5 écarts user :

1. **Bouton "New Project" en haut** ✓ confirmé — `.sb-top` contient 2 boutons stacked au-dessus du tree : `sb-action.primary` "Nouveau projet" + `sb-action` "Customize"
2. **Typographie** ✓ confirmée — sizes/weights/colors complets ci-dessous (section Typography map)
3. **Icon mark** ✓ confirmé — le mark n'est pas un SVG, c'est un `<span class="tb-brand-mark">` purement CSS (conic-gradient + pseudo-elements). 3 layers. Détail dans la section dédiée.
4. **Settings + About → Customize** ✓ confirmé — UN bouton `sb-action` "Customize" déclenche `CustomizeWindow` (modal scrim + 1100×740 window avec sidebar nav + 6 sections : Skills, MCP servers, Plugins, Channels, Apparence, Raccourcis). About dialog n'existe pas dans le mockup ; les credits éventuels iront dans un footer de la nav Customize ou rien.
5. **Sidebar hiérarchique Projects > Sessions** ✓ confirmé — projet = container expandable. Quand ouvert : `border-left line-soft padding-left 6px margin-left 14px` indentation, sessions enfants avec `session-status-dot` (running/idle/stopped) + name + claudeId mono 9.5px + `session-edit` (hover) + `session-toggle` (play/stop), et un `session-new` button "Nouvelle session" en bas du groupe.

Au-delà de ces 5 écarts, le mockup ajoute plein de **structures nouvelles** que jacqline n'a pas encore :

- `TitleBar` complet (38px, drag region, hamburger + panel toggle + brand + SystemMenu CPU% + min/max/close)
- `SystemMenu` popover macOS-menubar-style (CPU/Mémoire/Disque/Réseau gauges + processus list)
- `ProjectConfigWindow` (kebab projet → "Configurer le projet…")
- `SessionDialog` (new ET edit, avec agent picker grid 6 options)
- `Inspector` multi-tab dynamique avec `+Add` panel chooser cinematic
- Panneaux Inspector : File (md/code), Browser, Tasks, Diff
- Statusbar terminal bas avec Cloud sync toggle
- Sidebar collapsible (icon rail 60px quand replié) + resizers drag

C'est **80% de refonte** comme préventif orchestrator. À phaser en plusieurs PRs.

## Design tokens — remplacement complet de `src/index.css`

**Avant** (`src/index.css` actuel) :
- Background `oklch(0.04 0 0)` (~`#0a0a0a` pitch black)
- Card `oklch(0.13 0.005 30)` warm 30deg hue
- Primary `oklch(0.55 0.2 285)` chroma 0.2 lightness 0.55
- Radius `0.5rem` (8px)

**Après** (mockup) :
- Background warmer + lighter (l=0.16, c=0.004 hue=60deg yellow undertone)
- 4 niveaux de surface (bg-0/1/2/3) explicites
- Terminal a sa propre bg `bg-terminal` plus sombre (l=0.135)
- Accent chroma 0.18 lightness 0.66 (plus clair/froid que JacqCloud)
- 4 radii (s=6, base=8, l=12, xl=16)
- Tokens UI sizing : sb-w=248, sb-w-collapsed=56, titlebar-h=38, inspector-w=360

**Action :** remplacer le `@theme` actuel par le bloc suivant (à intégrer dans `@theme` Tailwind v4) :

```css
@theme {
  /* Neutrals (warm undertone, hue 60deg) */
  --color-bg-0: oklch(0.16 0.004 60);
  --color-bg-1: oklch(0.185 0.005 60);
  --color-bg-2: oklch(0.21 0.006 60);
  --color-bg-3: oklch(0.235 0.007 60);
  --color-bg-terminal: oklch(0.135 0.004 60);

  --color-line: oklch(0.27 0.008 60);
  --color-line-soft: oklch(0.235 0.006 60);

  --color-fg-0: oklch(0.96 0.005 60);
  --color-fg-1: oklch(0.78 0.008 60);
  --color-fg-2: oklch(0.58 0.008 60);
  --color-fg-3: oklch(0.42 0.007 60);

  /* Accent (violet family, hue 295) */
  --color-accent: oklch(0.66 0.18 295);
  --color-accent-soft: oklch(0.66 0.18 295 / 0.16);
  --color-accent-line: oklch(0.66 0.18 295 / 0.35);
  --color-accent-fg: oklch(0.85 0.13 295);

  /* Semantic */
  --color-ok: oklch(0.74 0.14 150);
  --color-warn: oklch(0.78 0.14 80);
  --color-err: oklch(0.68 0.18 25);
  --color-info: oklch(0.74 0.12 230);

  /* Radii */
  --radius-s: 6px;
  --radius: 8px;
  --radius-l: 12px;
  --radius-xl: 16px;

  /* App sizing */
  --jq-sb-w: 248px;
  --jq-sb-w-collapsed: 56px;
  --jq-inspector-w: 360px;
  --jq-titlebar-h: 38px;

  --font-sans: 'Geist Variable', ui-sans-serif, -apple-system, system-ui, sans-serif;
  --font-mono: 'Geist Mono Variable', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
}

html { color-scheme: dark; }

body {
  background: #000;  /* outer rim around .app-frame */
  color: var(--color-fg-0);
  font-family: var(--font-sans);
  font-feature-settings: "ss01", "ss02", "cv01", "cv11";
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
```

Aussi : **shadcn/ui tokens doivent être réalignés** sur ces vars. Les composants `button.tsx`, `dialog.tsx`, etc. utilisent `bg-card`, `bg-popover`, etc. qui ne correspondent plus aux nouveaux noms `bg-0..3`. Deux options :

- **Option A (recommandée)** : ajouter des aliases dans `@theme` pour préserver shadcn (`--color-card: var(--color-bg-1); --color-popover: var(--color-bg-2); --color-background: var(--color-bg-0); --color-primary: var(--color-accent); etc.`). Maintient la compat sans modifier shadcn.
- **Option B** : remplacer toutes les classes shadcn par les nouveaux noms. Plus propre mais plus de churn.

**Décision : Option A.** Aliases. Voici les bindings exacts à ajouter à `@theme` :

```css
@theme {
  /* shadcn aliases — map shadcn semantic names to jacqline tokens */
  --color-background: var(--color-bg-0);
  --color-foreground: var(--color-fg-0);
  --color-card: var(--color-bg-1);
  --color-card-foreground: var(--color-fg-0);
  --color-popover: var(--color-bg-2);
  --color-popover-foreground: var(--color-fg-0);
  --color-muted: var(--color-bg-2);
  --color-muted-foreground: var(--color-fg-2);
  --color-border: var(--color-line-soft);
  --color-input: var(--color-line);
  --color-ring: var(--color-accent);
  --color-primary: var(--color-accent);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-secondary: var(--color-bg-2);
  --color-secondary-foreground: var(--color-fg-0);
  --color-accent: var(--color-bg-3);  /* shadcn accent ≠ jacqline accent */
  --color-accent-foreground: var(--color-fg-0);
  --color-destructive: var(--color-err);
  --color-destructive-foreground: oklch(0.98 0 0);
}
```

Note : `--color-accent` shadcn (button ghost hover) ≠ `--color-accent` jacqline (purple). En interne dans les composants jacqline custom, utiliser `var(--color-accent)` ou les Tailwind utility `bg-accent-…` étendues — pour les nouveaux composants on n'utilise PAS les classes shadcn.

## Brand mark — refonte `jacqline-mark.tsx`

**Avant** (SVG purple square + white L stroke) :
```tsx
<svg viewBox="0 0 48 48" …>
  <rect width="48" height="48" rx="12" fill="#7c3aed" />
  <path d="M 16 20 L 16 40 L 32 40" stroke="#ffffff" strokeWidth="3" …/>
</svg>
```

**Après** (CSS-only span avec gradient + pseudo-elements layered) :
```tsx
interface JacqlineMarkProps {
  readonly size?: number; // px, default 18 (titlebar)
  readonly className?: string;
}

export function JacqlineMark({ size = 18, className }: JacqlineMarkProps) {
  return (
    <span
      className={cn("jacqline-mark", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
```

Et dans `src/index.css` (ou un nouveau `src/components/jacqline-mark.css` importé) :

```css
.jacqline-mark {
  display: inline-block;
  position: relative;
  border-radius: 5px;
  background: conic-gradient(
    from 220deg at 50% 50%,
    var(--color-accent),
    oklch(0.5 0.16 270),
    var(--color-accent)
  );
  box-shadow:
    inset 0 0 0 1px oklch(1 0 0 / 0.12),
    0 0 10px var(--color-accent-soft);
}
.jacqline-mark::after {
  content: ""; position: absolute; inset: 4px;
  border-radius: 3px;
  background: var(--color-bg-0);
}
.jacqline-mark::before {
  content: ""; position: absolute; inset: 6px 5px 6px 7px;
  border-left: 1.5px solid var(--color-fg-0);
  border-bottom: 1.5px solid var(--color-fg-0);
  border-bottom-left-radius: 2px;
  z-index: 1;
}
```

**Tailles d'usage :**
- TitleBar : `size={18}` (default)
- Customize window titlebar : `size={14}`
- Future splash / about : `size={36}` ou `size={48}`

⚠️ **Le radius/inset/border-width sont calibrés pour size=18.** Si on veut bien rescaler à 48px (splash), il faudra une variante `.jacqline-mark--large` avec `border-radius: 12px`, `inset: 10px`, `border-width: 4px`, etc. Pour 18-22px ça marche tel quel.

## Icon system — nouveau `src/components/icons.tsx`

Le mockup utilise un **set custom d'icônes inline SVG** (~30 icônes), pas lucide-react. Style : `viewBox="0 0 16 16"`, `strokeWidth="1.2"` à `1.4`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `currentColor`. Plus fin et plus dense que lucide stroke-2.

**Action :** créer `src/components/icons.tsx` qui exporte un objet `I` avec toutes les icônes du mockup (source : `/tmp/mockup-assets/1d632c51-*.js`). Copier-coller TEL QUEL en TSX.

Liste des icônes nécessaires (présentes dans le mockup) :
- Layout : `menu`, `panel_left`, `panel_right`, `close`, `min`, `max`, `chev`
- Actions : `plus`, `kebab`, `external`, `trash`, `rename`, `duplicate`, `edit`, `refresh`, `copy`
- Concepts : `folder`, `sparkle`, `cog`, `terminal`, `doc`, `check`, `globe`, `cpu`, `activity`, `play`, `stop`, `plug`, `branch`, `command`, `search`, `cloud`, `cloud_off`
- Navigation : `arrow_left`, `arrow_right`

**Suppression :** retirer `lucide-react` de `package.json` après refactor — toutes les icônes utilisateurs passent par `I.foo`.

**Pattern d'usage :**
```tsx
import { I } from "@/components/icons";
…
<button><I.plus /> New project</button>
<I.chev className="text-fg-3" />
```

Les icônes acceptent un prop spread (`{...p}`) — donc className/aria/onClick passent.

## TitleBar — nouveau composant `src/components/title-bar.tsx`

**Composant complet à créer** (n'existe pas dans jacqline actuel).

```tsx
// src/components/title-bar.tsx
import { JacqlineMark } from "@/components/jacqline-mark";
import { I } from "@/components/icons";

interface TitleBarProps {
  readonly sidebarCollapsed: boolean;
  readonly onToggleSidebar: () => void;
}

export function TitleBar({ sidebarCollapsed, onToggleSidebar }: TitleBarProps) {
  return (
    <header className="jq-titlebar">
      <div className="jq-tb-left">
        <button className="jq-tb-btn" style={{ width: 36 }}>
          <I.menu />
        </button>
        <button
          className="jq-tb-btn"
          style={{ width: 32 }}
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Étendre la sidebar" : "Replier la sidebar"}
        >
          {sidebarCollapsed ? <I.panel_right /> : <I.panel_left />}
        </button>
        <div className="jq-tb-brand">
          <JacqlineMark size={18} />
          <span>Jacqline</span>
        </div>
      </div>
      <div className="jq-tb-center" />
      <div className="jq-tb-right">
        {/* SystemMenu — peut être stub pour première itération */}
        <div className="jq-tb-divider" />
        {/* Window controls — Tauri 2 utilise sa propre API getCurrentWindow() */}
        <button className="jq-tb-btn" title="Minimize" onClick={() => getCurrentWindow().minimize()}>
          <I.min />
        </button>
        <button className="jq-tb-btn" title="Maximize" onClick={() => getCurrentWindow().toggleMaximize()}>
          <I.max />
        </button>
        <button className="jq-tb-btn close" title="Close" onClick={() => getCurrentWindow().close()}>
          <I.close />
        </button>
      </div>
    </header>
  );
}
```

**Tauri config requis** (`src-tauri/tauri.conf.json`) : la window doit avoir `"decorations": false` pour qu'on prenne le contrôle de la titlebar custom, et `"transparent": false` (on n'a pas besoin de transparence). Ajouter aussi `"titleBarStyle": "Overlay"` côté macOS pour préserver les feux tricolores natifs si tu veux la cohabitation (à ton choix — option simple : `decorations: false` partout).

⚠️ Le drag region nécessite `data-tauri-drag-region` sur l'élément `.jq-titlebar` côté React. Les boutons à l'intérieur doivent OPTOUT avec `data-tauri-drag-region={false}` (ou via CSS `-webkit-app-region: no-drag`, mais Tauri préfère l'attribute). À ajuster.

**Styles** (ajoute dans `src/index.css` ou un fichier dédié `src/styles/titlebar.css` importé) :

```css
.jq-titlebar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  height: var(--jq-titlebar-h);
  background: var(--color-bg-0);
  -webkit-app-region: drag;
  user-select: none;
  position: relative;
  z-index: 10;
}
.jq-tb-left { display: flex; align-items: center; gap: 8px; padding-left: 10px; }
.jq-tb-brand {
  display: flex; align-items: center; gap: 8px;
  font-weight: 600; font-size: 13px; letter-spacing: -0.01em;
  color: var(--color-fg-0);
}
.jq-tb-right { display: flex; align-items: center; -webkit-app-region: no-drag; gap: 6px; padding-left: 8px; }
.jq-tb-divider {
  width: 1px; height: 18px;
  background: var(--color-line-soft);
  margin: 0 2px 0 4px;
}
.jq-tb-btn {
  width: 44px; height: var(--jq-titlebar-h);
  display: grid; place-items: center;
  color: var(--color-fg-1); background: transparent; border: 0;
  cursor: pointer;
}
.jq-tb-btn:hover { background: var(--color-bg-3); color: var(--color-fg-0); }
.jq-tb-btn.close:hover { background: oklch(0.55 0.20 25); color: #fff; }
```

`SystemMenu` (CPU% + popover gauges) **est hors scope Phase B** — stub avec un placeholder div pour première itération, on l'implémentera quand la Tauri side aura les commands pour `system_stats`. Pas bloquant.

## AppShell — restructure complète

**Avant** (V1 issued spec) :
```tsx
<div className="bg-background flex h-full min-h-0 w-full flex-col">
  <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-4">
    <JacqlineMark size={40} />
    <span className="text-base font-semibold tracking-tight">Jacqline</span>
  </header>
  <div className="flex min-h-0 flex-1 gap-3 pb-6 pl-6">
    <ProjectsSidebar … />
    <MainPane />
    <RightPanel />
  </div>
</div>
```

**Après** (V2) :
```tsx
import { useState } from "react";
import { TitleBar } from "@/components/title-bar";
import { Sidebar } from "@/components/sidebar"; // renamed from projects-sidebar
import { MainPane } from "@/components/main-pane";
import { Inspector } from "@/components/inspector"; // renamed from right-panel
import { CustomizeWindow } from "@/components/customize-window";
import { ProjectConfigWindow } from "@/components/project-config-window";
import { SessionDialog } from "@/components/session-dialog";
import { useUiStore } from "@/stores/ui";

export function AppShell() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const inspectorHidden = useUiStore((s) => s.inspectorHidden);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  // projectConfigFor, newSessionFor, editSession states for the modals…

  return (
    <div
      className="jq-app-frame"
      data-sb={sidebarCollapsed ? "collapsed" : "expanded"}
      data-inspector={inspectorHidden ? "hidden" : "shown"}
    >
      <TitleBar sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
      <div className="jq-main">
        <Sidebar
          onOpenCustomize={() => setCustomizeOpen(true)}
          // … other props
        />
        <MainPane />
        {!inspectorHidden && <Inspector />}
      </div>
      <CustomizeWindow open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      {/* … other modals */}
    </div>
  );
}
```

Et la CSS :
```css
.jq-app-frame {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-rows: var(--jq-titlebar-h) 1fr;
  background: var(--color-bg-0);
  overflow: hidden;
}
.jq-main {
  display: grid;
  grid-template-columns: var(--jq-sb-w) 1fr var(--jq-inspector-w);
  min-height: 0;
  overflow: hidden;
  padding: 8px;
  background: var(--color-bg-0);
  gap: 0;
}
.jq-app-frame[data-sb="collapsed"] .jq-main {
  grid-template-columns: var(--jq-sb-w-collapsed) 1fr var(--jq-inspector-w);
}
.jq-app-frame[data-inspector="hidden"] .jq-main {
  grid-template-columns: var(--jq-sb-w) 1fr;
}
.jq-app-frame[data-sb="collapsed"][data-inspector="hidden"] .jq-main {
  grid-template-columns: var(--jq-sb-w-collapsed) 1fr;
}
```

**Notes :**
- Padding 8px partout sur `.jq-main` (le "floating gap" entre l'app-frame edge et les panneaux). Les panneaux n'ont PAS de margin individuelle — la gap vient du padding parent.
- Inspector apparaît en flush-right contre la window edge (right radius 0) — le 8px padding est juste un creux uniforme.
- Sidebar et Inspector ont `border-radius` complet sauf le côté contre la window edge (cf. CSS de chaque ci-dessous).
- `MainPane / .content` a `border-radius: 14px 0 0 14px` (seulement les coins gauches) — flush contre l'Inspector à droite.
- **MainPane bg = `var(--color-bg-terminal)`** (oklch 0.135 0.004 60), plus sombre que tout le reste. C'est le panneau "écran de l'app".

V1 spec wrappait MainPane en `bg-popover rounded-2xl border` — incorrect. La vraie chose : pas de radius côté Inspector, bg-terminal, et statusbar attachée en bas (cf. section MainPane).

**Resizers (optionnel, hors Phase B)** : `SidebarResizer` et `InspectorResizer` permettent drag-to-resize. Sources : `1aa80c2c-*.js` ligne 216-262. Stockage `localStorage` key `jacqline:sbw` / `jacqline:insw`. Peut être ajouté en Phase C.

## Store UI — nouveau `src/stores/ui.ts`

Le mockup utilise `useState` au niveau App ; jacqline préfère Zustand. Crée `src/stores/ui.ts` :

```ts
import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  inspectorHidden: boolean;
  sidebarWidth: number;
  inspectorWidth: number;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  setSidebarWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  inspectorHidden: false,
  sidebarWidth: 248,
  inspectorWidth: 360,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleInspector: () => set((s) => ({ inspectorHidden: !s.inspectorHidden })),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(480, w)) }),
  setInspectorWidth: (w) => set({ inspectorWidth: Math.max(260, Math.min(720, w)) }),
}));
```

Si tu veux persistance widths, ajoute `zustand/middleware/persist`.

## Sessions data model — coordination backend

Le mockup demande **multi-sessions réelles par projet** (cf. message orchestrator). Le current `src/stores/sessions.ts` jacqline gère `sessionsByProject: Map<projectId, SessionMeta>` (UNE session par projet, auto-spawn). Il faut passer à **N sessions par projet**.

**Shape data attendue (mockup `cc6c64df-*.js`)** :
```ts
interface Session {
  id: string;            // local id, e.g. "s1"
  name: string;          // user-facing label, e.g. "main", "tests", "docs"
  claudeId: string;      // ULID of the Claude Code session, e.g. "sess_01HX9F2A3KQM"
  lastMsg: string;       // preview of last assistant msg (tooltip)
  active: boolean;       // is this the active session in the main pane?
  status: "running" | "idle" | "stopped";
}

interface Project {
  id: string;
  name: string;
  color: string;         // oklch literal e.g. "oklch(0.66 0.18 295)"
  initial: string;       // single letter for the chip, e.g. "J"
  branch: string;
  cwd: string;
  wsl: boolean;
  distro: string | null;
  model: string;         // "claude-sonnet-4-5" etc.
  sessions: Session[];
  // Rest is Inspector data, can be added incrementally
}
```

**Backend refactor à faire avant l'implem du frontend** (separate PR per orchestrator) :
- `sessions.id` devient un local UUID, pas plus le pid claude
- Ajouter `sessions.name`, `sessions.claudeId`, `sessions.status` à la table SQL
- Migration : `ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''; ADD COLUMN claude_id TEXT NOT NULL DEFAULT ''; ADD COLUMN status TEXT NOT NULL DEFAULT 'stopped';`
- Commands Rust : `session_list_by_project(project_id)`, `session_create(project_id, name, agent)` retourne la nouvelle session, `session_kill(session_id)`, `session_update_meta(session_id, name)`
- Event `pty:exit:*` doit mettre `status = "stopped"` en SQL
- L'auto-spawn à l'activation projet (Phase 4 lesson) doit être **opt-in** : si le projet a 0 sessions, spawn une "main"; si ≥1 session existe, ne rien spawn (laisser l'user choisir)

Le `ClaudeId` est probablement un nouveau concept côté Rust : le PID + une session ID stable persisté en SQL. Ou bien `claude --resume <session_id>` reprend la session selon Claude CLI ; le backend stocke seulement le `session_id` que Claude lui donne. À toi de voir le mécanisme exact.

**Ne pas attendre ce refactor pour faire l'UI** : utilise un seed de mock data (copie `cc6c64df-*.js` PROJECTS dans un fichier `src/lib/mock-projects.ts` derrière un flag dev) pour développer l'UI de la sidebar. Quand backend prêt, swap.

## Sidebar — remplacement complet

**Avant** (état actuel — projects-sidebar.tsx) :
```tsx
<aside className="bg-card border-border flex w-[220px] shrink-0 flex-col rounded-2xl border">
  <div className="flex-1 overflow-y-auto p-3">
    <ul className="space-y-1.5">
      {projects.map(p => <li><button>…</button></li>)}
    </ul>
  </div>
  <div className="border-border border-t p-3">
    <Button onClick={onNewProject}><Plus className="size-4" />New project</Button>
  </div>
</aside>
```

**Après** (mockup) :
1. Renommer le fichier `src/components/projects-sidebar.tsx` → `src/components/sidebar.tsx` (terme générique car le composant gère aussi les sessions et le bouton Customize)
2. Structure complète (drop-in JSX, à adapter sur les stores jacqline) :

```tsx
// src/components/sidebar.tsx
import { useState, useEffect } from "react";
import { I } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsStore } from "@/stores/sessions";

interface SidebarProps {
  readonly onOpenCustomize: () => void;
  readonly onNewProject: () => void;
  readonly onNewSession: (projectId: string) => void;
  readonly onEditSession: (projectId: string, sessionId: string) => void;
  readonly onOpenProjectConfig: (projectId: string) => void;
}

export function Sidebar({
  onOpenCustomize,
  onNewProject,
  onNewSession,
  onEditSession,
  onOpenProjectConfig,
}: SidebarProps) {
  const projects = useProjectsStore((s) => s.projects);
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const setActiveProject = useProjectsStore((s) => s.setActive);
  // Sessions per project — from sessions store after backend refactor
  // For now if not yet refactored, derive from projects.sessions

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(projects.map((p) => [p.id, p.id === activeProjectId]))
  );
  const toggleOpen = (id: string) =>
    setOpenMap((m) => ({ ...m, [id]: !m[id] }));

  const [menuFor, setMenuFor] = useState<string | null>(null);
  useEffect(() => {
    if (!menuFor) return;
    const onDoc = () => setMenuFor(null);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuFor]);

  return (
    <aside className="jq-sidebar">
      {/* Top action buttons */}
      <div className="jq-sb-top">
        <button className="jq-sb-action primary" onClick={onNewProject} data-tip="Nouveau projet">
          <I.plus />
          <span className="label">Nouveau projet</span>
        </button>
        <button className="jq-sb-action" onClick={onOpenCustomize} data-tip="Customize">
          <I.sparkle />
          <span className="label">Customize</span>
        </button>
      </div>

      {/* Project tree */}
      <div className="jq-sb-section">
        <div className="jq-sb-heading">
          <span>Projets</span>
          <button title="Nouveau projet" onClick={onNewProject}>
            <I.plus />
          </button>
        </div>
        {projects.map((p) => (
          <div
            key={p.id}
            className="jq-project"
            data-open={openMap[p.id] ? "true" : "false"}
            data-has-running={p.sessions.some((s) => s.status === "running") ? "true" : "false"}
          >
            <div
              className={cn("jq-project-row", p.id === activeProjectId && "active")}
              onClick={() => {
                setActiveProject(p.id);
                toggleOpen(p.id);
              }}
              data-tip={p.name}
            >
              <span className="chev"><I.chev /></span>
              <span className="name">
                <span
                  className="jq-project-icon"
                  style={{
                    background: p.color + "40",
                    color: p.color,
                    border: "1px solid " + p.color + "60",
                  }}
                >
                  {p.initial}
                </span>
                <span className="jq-project-name-text">{p.name}</span>
              </span>
              <button
                className={cn("jq-kebab", menuFor === p.id && "active")}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === p.id ? null : p.id);
                }}
                title="Actions"
              >
                <I.kebab />
              </button>
            </div>

            {menuFor === p.id && (
              <div className="jq-context-menu" onMouseDown={(e) => e.stopPropagation()}>
                <button className="jq-ctx-item" onClick={() => { setMenuFor(null); onOpenProjectConfig(p.id); }}>
                  <I.cog /><span>Configurer le projet…</span><span className="kbd">⌘,</span>
                </button>
                <button className="jq-ctx-item" onClick={() => { setMenuFor(null); onNewSession(p.id); }}>
                  <I.plus /><span>Nouvelle session</span><span className="kbd">⌘T</span>
                </button>
                <button className="jq-ctx-item">
                  <I.external /><span>Ouvrir dans Explorer…</span>
                </button>
                <div className="jq-ctx-divider" />
                <button className="jq-ctx-item">
                  <I.rename /><span>Renommer…</span>
                </button>
                <button className="jq-ctx-item">
                  <I.duplicate /><span>Dupliquer</span>
                </button>
                <div className="jq-ctx-divider" />
                <button className="jq-ctx-item danger">
                  <I.trash /><span>Supprimer le projet…</span>
                </button>
              </div>
            )}

            {openMap[p.id] && (
              <div className="jq-sessions">
                {p.sessions.map((s) => {
                  const isActive = p.id === activeProjectId && /* activeSessionId === s.id */ false;
                  return (
                    <div
                      key={s.id}
                      className={cn("jq-session", "status-" + s.status, isActive && "active")}
                      onClick={() => { /* setActiveSession(p.id, s.id) */ }}
                      title={"Claude session: " + s.claudeId}
                    >
                      <span className={cn("jq-session-status-dot", s.status)} />
                      <span className="jq-session-main">
                        <span className="jq-session-name">{s.name}</span>
                        <span className="jq-session-cid">{s.claudeId.replace("sess_", "")}</span>
                      </span>
                      <button
                        className="jq-session-edit"
                        onClick={(e) => { e.stopPropagation(); onEditSession(p.id, s.id); }}
                        title="Modifier la session"
                      >
                        <I.edit />
                      </button>
                      <button
                        className={cn("jq-session-toggle", s.status)}
                        onClick={(e) => { e.stopPropagation(); /* toggle status */ }}
                        title={s.status === "running" ? "Stopper la session" : "Reprendre la session"}
                      >
                        {s.status === "running" ? <I.stop /> : <I.play />}
                      </button>
                    </div>
                  );
                })}
                <button
                  className="jq-session-new"
                  onClick={(e) => { e.stopPropagation(); onNewSession(p.id); }}
                >
                  <I.plus /><span>Nouvelle session</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

**CSS sidebar à ajouter** (copie 1:1 du mockup, classes préfixées `jq-` pour éviter collision shadcn) :

```css
.jq-sidebar {
  background: var(--color-bg-1);
  border: 1px solid var(--color-line-soft);
  border-radius: 14px;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  overflow: hidden;
  box-shadow:
    0 1px 0 oklch(1 0 0 / 0.02) inset,
    0 6px 16px oklch(0 0 0 / 0.18);
}

/* Top: Nouveau projet + Customize stacked */
.jq-sb-top {
  padding: 12px 10px 8px 10px;
  display: flex; flex-direction: column; gap: 4px;
}
.jq-sb-action {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px; border-radius: 6px;
  color: var(--color-fg-1); cursor: pointer;
  font-size: 13px;
  border: 0; background: transparent; text-align: left;
  width: 100%;
}
.jq-sb-action svg { flex-shrink: 0; opacity: 0.9; }
.jq-sb-action.primary {
  background: var(--color-accent-soft);
  color: var(--color-accent-fg);
  border: 1px solid var(--color-accent-line);
}
.jq-sb-action.primary:hover { background: oklch(0.66 0.18 295 / 0.22); }
.jq-sb-action:hover { background: var(--color-bg-3); color: var(--color-fg-0); }

/* Section: tree of projects */
.jq-sb-section {
  overflow-y: auto;
  padding: 6px 6px 12px;
  min-height: 0;
}
.jq-sb-section::-webkit-scrollbar { width: 8px; }
.jq-sb-section::-webkit-scrollbar-thumb { background: var(--color-bg-3); border-radius: 4px; }
.jq-sb-section::-webkit-scrollbar-track { background: transparent; }

.jq-sb-heading {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 10px 6px;
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--color-fg-3);
}
.jq-sb-heading button {
  background: transparent; border: 0; color: var(--color-fg-2); cursor: pointer;
  width: 18px; height: 18px; display: grid; place-items: center; border-radius: 4px;
}
.jq-sb-heading button:hover { background: var(--color-bg-3); color: var(--color-fg-0); }

/* Project row */
.jq-project {
  display: flex; flex-direction: column; gap: 1px;
  margin-bottom: 4px;
  position: relative;
}
.jq-project-row {
  display: grid; grid-template-columns: 16px 1fr auto; align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-fg-1);
  font-size: 13px;
}
.jq-project-row:hover { background: var(--color-bg-2); color: var(--color-fg-0); }
.jq-project-row.active {
  background: var(--color-bg-3);
  color: var(--color-fg-0);
  box-shadow: inset 2px 0 0 var(--color-accent);
}
.jq-project-row .chev { color: var(--color-fg-3); transition: transform 0.15s ease; }
.jq-project[data-open="true"] .jq-project-row .chev { transform: rotate(90deg); }
.jq-project-row .name {
  display: flex; align-items: center; gap: 8px; min-width: 0;
}
.jq-project-name-text {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.jq-project-icon {
  width: 16px; height: 16px;
  border-radius: 4px;
  display: grid; place-items: center;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
}

/* Sessions sub-tree */
.jq-sessions {
  display: flex; flex-direction: column;
  margin: 2px 0 6px 14px;
  border-left: 1px solid var(--color-line-soft);
  padding-left: 6px;
}
.jq-session {
  display: grid; grid-template-columns: 8px 1fr auto auto;
  gap: 8px;
  padding: 5px 6px 5px 8px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--color-fg-2);
  cursor: pointer;
  align-items: center;
  min-width: 0;
}
.jq-session:hover { background: var(--color-bg-2); color: var(--color-fg-0); }
.jq-session.active { background: var(--color-bg-3); color: var(--color-fg-0); }

.jq-session-status-dot {
  width: 7px; height: 7px;
  border-radius: 999px;
  background: var(--color-fg-3);
}
.jq-session-status-dot.running {
  background: var(--color-ok);
  box-shadow: 0 0 6px var(--color-ok);
  animation: jq-pulse 2s ease-in-out infinite;
}
.jq-session-status-dot.stopped { background: oklch(0.45 0.007 60); }
.jq-session-status-dot.idle    { background: var(--color-warn); }
@keyframes jq-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}

.jq-session-main {
  display: flex; flex-direction: column; gap: 1px;
  min-width: 0;
}
.jq-session-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: inherit;
}
.jq-session.status-stopped .jq-session-name { color: var(--color-fg-3); }
.jq-session-cid {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--color-fg-3);
  letter-spacing: 0.02em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.jq-session-edit, .jq-session-toggle {
  width: 22px; height: 22px;
  display: grid; place-items: center;
  border-radius: 5px;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.12s ease, color 0.12s ease, background 0.12s ease;
}
.jq-session-edit { color: var(--color-fg-3); opacity: 0; }
.jq-session-toggle { color: var(--color-fg-2); opacity: 0.7; }
.jq-session:hover .jq-session-edit,
.jq-session:hover .jq-session-toggle { opacity: 1; }
.jq-session-edit:hover, .jq-session-toggle:hover {
  background: var(--color-bg-1);
  border-color: var(--color-line);
  color: var(--color-fg-0);
}
.jq-session-toggle.running {
  color: var(--color-err);
  opacity: 1;
}
.jq-session-toggle.running:hover {
  background: oklch(0.68 0.18 25 / 0.12);
  border-color: oklch(0.68 0.18 25 / 0.4);
}
.jq-session-toggle.stopped, .jq-session-toggle.idle {
  color: var(--color-accent-fg);
  opacity: 1;
}
.jq-session-toggle.stopped:hover, .jq-session-toggle.idle:hover {
  background: var(--color-accent-soft);
  border-color: var(--color-accent-line);
}

.jq-session-new {
  display: flex; align-items: center; gap: 8px;
  background: transparent; border: 0;
  margin: 2px 0 0 2px;
  padding: 5px 6px;
  border-radius: 6px;
  color: var(--color-fg-3);
  font-size: 11.5px;
  font-family: var(--font-sans);
  cursor: pointer;
  text-align: left;
}
.jq-session-new:hover { background: var(--color-bg-2); color: var(--color-fg-0); }

/* Kebab + context menu */
.jq-project-row .jq-kebab {
  width: 22px; height: 22px;
  display: grid; place-items: center;
  border-radius: 5px;
  background: transparent; border: 0;
  color: var(--color-fg-2); cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease;
}
.jq-project-row:hover .jq-kebab,
.jq-project-row .jq-kebab.active { opacity: 1; }
.jq-project-row .jq-kebab:hover { background: var(--color-bg-1); color: var(--color-fg-0); }

.jq-context-menu {
  position: absolute;
  top: 34px; right: 8px;
  background: oklch(0.20 0.006 60 / 0.97);
  border: 1px solid var(--color-line);
  border-radius: 8px;
  padding: 5px;
  min-width: 220px;
  box-shadow: 0 18px 50px oklch(0 0 0 / 0.55);
  z-index: 30;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  animation: jq-pop-in 0.12s ease;
  display: flex; flex-direction: column; gap: 1px;
}
@keyframes jq-pop-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}
.jq-ctx-item {
  display: grid; grid-template-columns: 16px 1fr auto;
  gap: 10px; align-items: center;
  padding: 6px 8px;
  background: transparent; border: 0;
  border-radius: 5px;
  color: var(--color-fg-1);
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
}
.jq-ctx-item:hover { background: var(--color-bg-3); color: var(--color-fg-0); }
.jq-ctx-item.danger { color: var(--color-err); }
.jq-ctx-item.danger:hover { background: oklch(0.68 0.18 25 / 0.10); }
.jq-ctx-item .kbd {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--color-fg-3);
}
.jq-ctx-divider { height: 1px; background: var(--color-line-soft); margin: 3px 2px; }
```

**Notes :**
- Préfixe `jq-` partout pour éviter collision avec shadcn (qui peut utiliser `.sidebar`, `.session`, etc. comme noms communs).
- Le `:hover .jq-kebab { opacity: 1 }` cache le kebab par défaut — apparaît au hover du projet. Bon pattern, copier tel quel.
- `data-tip` est utilisé pour les tooltips quand sidebar collapsed (CSS `::after content: attr(data-tip)`). Hors Phase B si pas implémenté.
- Le `.jq-session.status-stopped .jq-session-name` rend le nom grisé pour les sessions stoppées — petit détail UX important.

## MainPane — restructure

**Avant** (V1) : wrapper `bg-popover rounded-2xl border` + header avec icon + name + cwd.
**Après** (mockup) : `.content` flush contre Inspector (right radius 0), bg `bg-terminal`, **statusbar en bas** au lieu de header en haut.

```tsx
// src/components/main-pane.tsx
import { Terminal } from "@/components/terminal";
import { Statusbar } from "@/components/statusbar";
import { useActiveProject } from "@/stores/projects";

export function MainPane() {
  const project = useActiveProject();
  // … session selection logic

  if (project === null) {
    return (
      <section className="jq-content jq-content-empty">
        <div className="jq-empty-msg">Select a project or create a new one.</div>
      </section>
    );
  }

  return (
    <section className="jq-content">
      <div className="jq-xterm-wrap">
        <Terminal sessionId={activeSessionId} />
      </div>
      <Statusbar project={project} session={activeSession} />
    </section>
  );
}
```

CSS :
```css
.jq-content {
  display: grid;
  grid-template-rows: 1fr auto;
  min-width: 0; min-height: 0;
  background: var(--color-bg-terminal);
  border: 1px solid var(--color-line-soft);
  border-right: 0;
  border-radius: 14px 0 0 14px;
  overflow: hidden;
  box-shadow:
    0 1px 0 oklch(1 0 0 / 0.02) inset,
    0 6px 16px oklch(0 0 0 / 0.18);
}
.jq-xterm-wrap {
  background: var(--color-bg-terminal);
  min-height: 0;
  position: relative;
  display: grid;
  overflow: hidden;
}
.jq-content-empty {
  display: grid; place-items: center;
  color: var(--color-fg-2);
}
```

**Note :** quand Inspector est masqué (`data-inspector="hidden"`), `.content` n'a plus de panneau à droite. Soit on étend son radius (`border-right: 1px; border-radius: 14px;`), soit on accepte la coupure. Mockup choisit la coupure simple (`border-right: 0` toujours). Réplique.

## Statusbar — nouveau composant `src/components/statusbar.tsx`

```tsx
// src/components/statusbar.tsx
import { useState } from "react";
import { I } from "@/components/icons";
import { useUiStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";
import type { SessionMeta } from "@/types/session";

interface StatusbarProps {
  readonly project: Project;
  readonly session: SessionMeta;
}

export function Statusbar({ project, session }: StatusbarProps) {
  const [cloudSync, setCloudSync] = useState(true);
  const inspectorHidden = useUiStore((s) => s.inspectorHidden);
  const toggleInspector = useUiStore((s) => s.toggleInspector);

  return (
    <div className="jq-statusbar">
      <span className="jq-seg"><I.branch /><span>{project.branch}</span></span>
      <span className="jq-seg"><span className="dim">cwd</span><span>{project.cwd}</span></span>
      <span className="jq-seg"><span className="dim">model</span><span>{project.model}</span></span>
      <span className="jq-seg"><span className="dim">session</span><span>{session.claudeId.replace("sess_", "")}</span></span>
      <span className="jq-spacer" />
      <button
        className={cn("jq-sb-cloud", cloudSync ? "on" : "off")}
        onClick={() => setCloudSync((v) => !v)}
        title={cloudSync ? "Sauvegarde cloud activée — clic pour désactiver" : "Sauvegarde locale uniquement — clic pour activer"}
      >
        {cloudSync ? <I.cloud /> : <I.cloud_off />}
        <span className="jq-sb-cloud-label">Cloud</span>
        <span className="jq-sb-cloud-state">{cloudSync ? "sync" : "off"}</span>
      </button>
      <span className="jq-sb-actions">
        <button className="jq-iconbtn-sm" title="Recharger"><I.refresh /></button>
        <button className="jq-iconbtn-sm" title="Copier la sortie"><I.copy /></button>
        <button
          className={cn("jq-iconbtn-sm", !inspectorHidden && "active")}
          title="Inspecteur"
          onClick={toggleInspector}
        >
          <I.panel_right />
        </button>
      </span>
    </div>
  );
}
```

CSS :
```css
.jq-statusbar {
  display: flex; align-items: center; gap: 14px;
  padding: 4px 12px;
  height: 26px;
  background: var(--color-bg-1);
  border-top: 1px solid var(--color-line-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-fg-2);
}
.jq-statusbar .jq-seg { display: flex; align-items: center; gap: 6px; }
.jq-statusbar .jq-seg .dim { color: var(--color-fg-3); }
.jq-statusbar .jq-spacer { flex: 1; }

.jq-sb-cloud {
  display: inline-flex; align-items: center; gap: 6px;
  height: 20px;
  padding: 0 8px;
  border-radius: 4px;
  border: 1px solid var(--color-line-soft);
  background: var(--color-bg-2);
  color: var(--color-fg-2);
  font: inherit;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease;
}
.jq-sb-cloud:hover { background: var(--color-bg-3); color: var(--color-fg-0); }
.jq-sb-cloud-label { font-family: var(--font-sans); font-size: 11px; font-weight: 500; }
.jq-sb-cloud-state {
  font-family: var(--font-mono); font-size: 10px;
  padding: 0 5px; border-radius: 3px;
  background: var(--color-bg-1);
  border: 1px solid var(--color-line-soft);
}
.jq-sb-cloud.on {
  color: var(--color-accent-fg);
  border-color: var(--color-accent-line);
  background: var(--color-accent-soft);
}
.jq-sb-cloud.on:hover { background: oklch(0.66 0.18 295 / 0.22); }
.jq-sb-cloud.on .jq-sb-cloud-state {
  background: var(--color-accent); border-color: var(--color-accent); color: #fff;
}
.jq-sb-cloud.off { color: var(--color-fg-3); }
.jq-sb-cloud.off .jq-sb-cloud-state { color: var(--color-fg-3); }

.jq-sb-actions {
  display: inline-flex; align-items: center; gap: 2px;
  margin-left: 8px; padding-left: 10px;
  border-left: 1px solid var(--color-line-soft);
  height: 18px;
}
.jq-iconbtn-sm {
  width: 22px; height: 18px;
  display: grid; place-items: center;
  background: transparent; border: 0;
  border-radius: 4px;
  color: var(--color-fg-2);
  cursor: pointer;
}
.jq-iconbtn-sm:hover { background: var(--color-bg-2); color: var(--color-fg-0); }
.jq-iconbtn-sm.active { background: var(--color-bg-3); color: var(--color-fg-0); }
```

**Note** : la "Cloud sync" est un placeholder visuel pour V2. L'orchestrator a en backlog (`jacqcloud-buses`) le support d'export cloud des sessions ; pour la spec actuelle, le toggle est local-only (state useState).

## Terminal — adapt theme + remove top header

**Avant** : Terminal a un wrapper bg `#181614` et il y avait un header en haut du MainPane.
**Après** :
- Background xterm = `var(--color-bg-terminal)` (oklch 0.135 0.004 60), pas `#181614` (qui était un noir warm calculé par V1, légèrement off du token mockup)
- Plus de top header sur MainPane — le header est remplacé par le statusbar en bas
- Selon mockup, terminal padding interne `14px 18px 18px` (top right bottom-and-left), font-size `12.5px`, line-height `1.55`

**Diff `terminal.tsx`** :
```tsx
const JACQLINE_THEME: ITheme = {
  background: "#1d1c1a",      // approximation of oklch(0.135 0.004 60) — exact at runtime via getComputedStyle if needed
  foreground: "#e8e7e5",      // oklch(0.92 0.005 60)
  cursor: "#a78bfa",          // accent-fg
  cursorAccent: "#1d1c1a",
  selectionBackground: "#3a3735",
  selectionForeground: "#e8e7e5",
  black:        "#1a1816",
  red:          "#e07a7a",
  green:        "#7cc78a",
  yellow:       "#dab464",
  blue:         "#7d9ee5",
  magenta:      "#b794f6",
  cyan:         "#6cc6c2",
  white:        "#d4d2cf",
  brightBlack:  "#5a5754",
  brightRed:    "#ff8e8e",
  brightGreen:  "#9ada9c",
  brightYellow: "#f0cb7a",
  brightBlue:   "#9bb7f0",
  brightMagenta:"#cba8ff",
  brightCyan:   "#86dfd9",
  brightWhite:  "#ffffff",
};
```

Padding wrapper : retire le `p-3` extérieur (devenait inutile vu que `.jq-xterm-wrap` n'a plus de padding extérieur — c'est `.content` qui gère la chrome). Garde le split wrapper/inner pour FitAddon.

## Inspector — refonte multi-tabs

`right-panel.tsx` actuel est un Tabs Files/Inspector statique. Mockup : **système multi-tabs dynamique** avec :
- Tabs par défaut : `CLAUDE.md`
- Bouton `+` → ouvre un PanelChooser (modal-like local au panneau) avec des tiles : CLAUDE.md / AGENTS.md / README.md / CONTRIBUTING.md / Browser / Tasks / Diff / Ouvrir un fichier…
- Chaque tab peut être fermé
- 4 types de panel : `file` (md ou code), `browser`, `tasks`, `diff`

**Action :** renommer `src/components/right-panel.tsx` → `src/components/inspector.tsx` puis remplacer le contenu. Copier la structure du mockup module `4e6ebf09-*.js` — beaucoup trop long à inliner ici, mais le code est lisible et complet.

Côté CSS, ajouter le bloc `.jq-inspector / .jq-insp-tabs / .jq-insp-tab / .jq-insp-add / .jq-insp-add-menu / .jq-insp-empty / .jq-insp-body / .jq-insp-section / .jq-insp-h / .jq-insp-row` directement du mockup CSS (lignes 816-1003 de `/tmp/mockup-assets/_app.css`). Préfixer `jq-`.

Inspector container key style (à recopier) :
```css
.jq-inspector {
  background: var(--color-bg-1);
  border: 1px solid var(--color-line-soft);
  border-left: 0;
  border-radius: 0 14px 14px 0;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  overflow: hidden;
  box-shadow:
    0 1px 0 oklch(1 0 0 / 0.02) inset,
    0 6px 16px oklch(0 0 0 / 0.18);
}
```

**Note Phase B vs Phase C :** Inspector multi-tabs avec PanelChooser, FilePanel md/code, BrowserPanel, TasksPanel, DiffPanel — c'est beaucoup. Phaser :
- **Phase B** : Inspector container + un seul tab statique "CLAUDE.md" qui pointe vers `$CWD/CLAUDE.md` lu via `fs_read`. Pas de PanelChooser ni autres panels yet. EmptyInspector state si pas de CLAUDE.md.
- **Phase C** : Tabs dynamiques + PanelChooser + Browser/Tasks/Diff panels.

## CustomizeWindow — nouveau composant

Voir module mockup `8a53e210-*.js` — JSX complet à recopier. Structure :
- `cust-scrim` (fixed inset-0, semi-opaque blur backdrop)
- `cust-window` (1100×740, bg-0, rounded-xl, with `cust-titlebar` (own header with brand mark 14px + "Customize" + "global · all projects" mono caption + close button) + `cust-body` 2-col grid (240px nav + 1fr content))
- 6 sections : Skills (cards grid), MCP servers (rows list), Plugins (cards), Channels (rows), Apparence (theme swatches + font swatches), Raccourcis (key rows)
- Plus une section "Aide" en bas de la nav avec Documentation / Communauté

**Action :**
1. Crée `src/components/customize-window.tsx` avec la structure complète du module mockup
2. **Supprime** `src/components/settings-dialog.tsx` (remplacé)
3. **Supprime** `src/components/about-dialog.tsx` (remplacé — pas équivalent dans le mockup, sauf si tu veux ajouter un onglet "À propos" à la nav, optionnel)

CSS Customize complète : copier de `_app.css` lignes 1371-1640 (`.cust-*` + `.swatches` + `.seg-control` + `.key-row` + `.key-combo kbd`). Préfixe `jq-`.

**Phase B simplifications acceptables :**
- Skills/MCP/Plugins/Channels sections : utiliser des données vides en Phase B (juste les CustHeader + une empty state), wire au backend en Phase D+
- Apparence section : juste les theme swatches en non-fonctionnel (4 themes), font swatches non-fonctionnel
- Shortcuts section : juste affichage (les vrais bindings global hotkeys c'est Tauri-side, Phase E)

L'important Phase B : la SHELL Customize (modal scrim + window with sidebar nav + content area) doit exister et être déclenchable depuis Sidebar → Customize button. Le contenu peut être placeholder.

## ProjectConfigWindow — nouveau composant

Même shell que CustomizeWindow mais scope projet. Déclenché depuis le kebab d'un projet → "Configurer le projet…". 6 sections : Général, Lancement, Environnement, Skills, MCP, Preview web.

**Action :** créer `src/components/project-config-window.tsx` avec la structure de `6e91a44c-*.js`. Réutilise les classes CSS `jq-cust-*` (puisque le shell est identique). Les sections internes utilisent `.jq-pc-grid`, `.jq-pc-field`, `.jq-pc-code`, `.jq-pc-env*` — copier du mockup CSS lignes 1641-1707.

**Phase B simplifications :**
- "Lancement" : affiche la commande générée (la vraie est composée depuis `project.cwd / project.model / project.shell / etc.` déjà existants)
- "Environnement" : utilise une liste in-memory pour la première itération
- Les sections "Skills" et "MCP" peuvent juste rediriger vers Customize via un bouton "Ouvrir Customize" (déjà prévu dans le mockup)
- "Preview web" : input URL + titre, persiste dans `project.preview` (à ajouter au schema SQL en Phase C)

## SessionDialog — refonte (replace NewProjectDialog avec context différent)

Le mockup a `SessionDialog` (new + edit modes). Le `NewProjectDialog` actuel de jacqline est pour créer un PROJET (cwd + shell). Garder le NewProjectDialog (mais le restyler aussi). Et ajouter le SessionDialog.

**Différence sémantique :**
- `NewProjectDialog` : créer un projet (cwd, shell, name). Déclenché par sidebar "Nouveau projet".
- `SessionDialog` (new mode) : créer une session dans un projet existant (agent, name). Déclenché par sidebar kebab → "Nouvelle session" ou par session-new button.
- `SessionDialog` (edit mode) : modifier une session (agent, name). Déclenché par session-edit icon button.

**Action :**
1. Crée `src/components/session-dialog.tsx` (source : `a010fbb1-*.js`). Agent picker grid 2-col avec 6 options (default / code-reviewer / test-runner / doc-writer / pr-reviewer / release-notes).
2. **Restyle** `new-project-dialog.tsx` avec les classes `jq-ns-*` (eyebrow, header, body, field, footer) pour cohérence visuelle. L'agent picker n'existe pas pour le NewProjectDialog (juste name, cwd, shell), mais la chrome (scrim, window, header, footer) doit matcher.

CSS Session dialog : copier `.ns-*` (lignes 1709-1857 de `_app.css`). Préfixe `jq-ns-`.

## Typography map

Tableau exhaustif des tailles/poids/colors utilisés dans le mockup (extrait du CSS) :

| Élément | Font | Size | Weight | Color | Letter-spacing | Notes |
|---|---|---|---|---|---|---|
| Body default | sans | 14px | 400 | fg-0 | normal | base |
| Titlebar brand | sans | 13px | 600 | fg-0 | -0.01em | wordmark à côté du mark |
| Titlebar center crumb | mono | 11.5px | 400 | fg-2 | normal | breadcrumb mono |
| SystemMenu trigger | mono | 11px | 400 | fg-1 | normal | "23%" CPU |
| SystemMenu title (popover) | sans | 13px | 600 | fg-0 | normal | "Système local" |
| SystemMenu sub | mono | 11px | 400 | fg-3 | normal | "Windows 11" |
| Sidebar action label | sans | 13px | 400 | fg-1 / accent-fg | normal | "Nouveau projet" / "Customize" |
| Sidebar section heading | sans | 10.5px | 600 | fg-3 | 0.08em uppercase | "PROJETS" |
| Project row name | sans | 13px | 400 | fg-1 | normal | "Jacquouille" |
| Project icon initial | mono | 9px | 600 | (project.color) | normal | "J" dans le chip 16×16 |
| Session name | sans | 12.5px | 400 | fg-2 (or fg-0 active) | normal | "main" / "tests" |
| Session claudeId | mono | 9.5px | 400 | fg-3 | 0.02em | "01HX9F2A3KQM" |
| Session-new button | sans | 11.5px | 400 | fg-3 | normal | "Nouvelle session" |
| Statusbar segs | mono | 11px | 400 | fg-2 | normal | "feat/skills-engine" |
| Statusbar cloud label | sans | 11px | 500 | varies | normal | "Cloud" |
| Statusbar cloud state | mono | 10px | 400 | varies | normal | "sync" / "off" |
| Terminal xterm | mono | 12.5px | 400 | varies (xline-*) | normal | line-height 1.55 |
| Customize header h1 | sans | 22px | 600 | fg-0 | -0.02em | "Skills" |
| Customize header p | sans | 13px | 400 | fg-2 | normal | description max-width 60ch |
| Customize section h3 | sans | 11px | 600 | fg-3 | 0.08em uppercase | "Thème" |
| Customize nav heading | sans | 10.5px | 600 | fg-3 | 0.08em uppercase | "Réglages" |
| Customize nav item | sans | 13px | 400 | fg-1 (or fg-0 active) | normal | "Skills" / "MCP servers" |
| Customize card title | mono | 13px | 400 | fg-0 | normal | "code-review" |
| Customize card meta | mono | 11px | 400 | fg-3 | normal | "by you" |
| Customize card desc | sans | 12px | 400 | fg-2 | normal | line-height 1.5 |
| Customize row title | sans | 13px | 400 | fg-0 | normal | row main label |
| Customize row sub | sans | 11.5px | 400 | fg-2 | normal | row description |
| SessionDialog eyebrow | sans | 10.5px | 600 | accent-fg | 0.08em uppercase | "Nouvelle session" |
| SessionDialog h2 | sans | 18px | 600 | fg-0 | -0.01em | project name |
| SessionDialog label | sans | 11px | 500 | fg-2 | normal | "Nom de la session" |
| SessionDialog agent label | mono | 12px | 400 | fg-0 | normal | "default" / "code-reviewer" |
| SessionDialog agent desc | sans | 11px | 400 | fg-2 | normal | description agent |
| Field input | sans | 12px | 400 | fg-0 | normal | inputs |
| Btn text | sans | 11.5px | 400 | varies | normal | base button |
| Inspector tab text | sans | 12px | 400 | fg-2 (fg-0 active) | normal | tab label |
| Inspector empty title | sans | 13px | 500 | fg-0 | normal | "Aucun panneau ouvert" |
| Inspector empty desc | sans | 12px | 400 | fg-2 | normal | line-height 1.5 |
| Chip | mono | 11px | 400 | fg-1 | normal | tags génériques |
| KBD | mono | 10-11px | 400 | fg-1 / fg-2 | normal | shortcut keys |
| Context menu item | sans | 12.5px | 400 | fg-1 | normal | "Configurer le projet…" |

**Family bindings :**
- `--font-sans: 'Geist'` — partout sauf mention contraire
- `--font-mono: 'Geist Mono'` — slugs, claudeIds, paths, model names, code, KBD, chip text, project initials

**Color hierarchy :**
- `fg-0` (0.96 lightness) — titres, labels actifs, valeurs principales
- `fg-1` (0.78) — texte secondaire, labels par défaut
- `fg-2` (0.58) — muted, descriptions
- `fg-3` (0.42) — very muted, hint, claudeIds, captions

**Letter-spacing :**
- Headings uppercase : `0.06–0.08em` ALWAYS
- Titles non-uppercase : `-0.01em` à `-0.02em` (tighter)
- Mono : `0` ou `0.02em` (claudeIds)

## Implementation order

Voir la section "Phases d'implémentation" en haut du document (A→G, 7 PRs avec mapping fichiers + dépendances + risque).

## Fichiers actuels à supprimer

- `src/components/about-dialog.tsx` — consolidé dans Customize (Phase F)
- `src/components/settings-dialog.tsx` — consolidé dans Customize (Phase F)

## Fichiers actuels à renommer/restructurer majeurement

- `src/components/projects-sidebar.tsx` → `src/components/sidebar.tsx` (Phase D, full rewrite)
- `src/components/right-panel.tsx` → `src/components/inspector.tsx` (Phase G, full rewrite)
- `src/components/jacqline-mark.tsx` (Phase B, full rewrite to CSS-only)
- `src/components/app-shell.tsx` (Phase C, grid restructure)
- `src/components/main-pane.tsx` (Phase E, drop header, add Statusbar)
- `src/components/terminal.tsx` (Phase E, theme update)
- `src/components/new-project-dialog.tsx` (Phase F, restyle ns-*)

## Fichiers nouveaux à créer

- `src/components/icons.tsx` (Phase B)
- `src/components/title-bar.tsx` (Phase C)
- `src/components/statusbar.tsx` (Phase E)
- `src/components/customize-window.tsx` (Phase F)
- `src/components/project-config-window.tsx` (Phase F)
- `src/components/session-dialog.tsx` (Phase F)
- `src/stores/ui.ts` (Phase C)

CSS : peut être consolidée dans `src/index.css` (l'app n'est pas si grosse). Si tu préfères découper, mets dans `src/styles/{titlebar,sidebar,statusbar,inspector,customize,session-dialog}.css` et `@import` depuis `index.css`.

## Vérification visuelle (les 7 critères deviennent 12)

Après V2 complète :
- [ ] Custom TitleBar 38px avec drag region + brand mark + window controls (pas la titlebar OS native)
- [ ] Brand mark = carré gradient conic + cutout intérieur + "L" stroke (pas un SVG rect+path)
- [ ] Sidebar avec 2 boutons en haut ("Nouveau projet" primary + "Customize")
- [ ] Heading "PROJETS" uppercase letter-spaced
- [ ] Project rows avec chev expandable + initial chip coloré (16×16, mono 9px)
- [ ] Sessions sub-tree indentée avec border-left + status dot pulsant pour running
- [ ] Inspector multi-tab avec + button (au moins tab CLAUDE.md fonctionnel en Phase G)
- [ ] Customize window (modal scrim + 1100×740 + sidebar nav 6 sections)
- [ ] Statusbar bas du terminal avec Cloud sync + iconbtns
- [ ] Terminal area flush contre Inspector (right radius 0) + bg-terminal plus sombre
- [ ] Toutes les icônes sont du set custom inline SVG (pas lucide)
- [ ] Aucun composant n'utilise les anciens dialogs Settings/About (suppr)

Une fois ces 12 critères passés, le rendu match le mockup pixel-near-perfect.

## Décisions tranchées (zéro question ouverte)

| Décision | Choix | Raison |
|---|---|---|
| Shadcn alias vs replace | Option A (alias) | Évite churn massif des composants ui/ existants |
| Brand mark scaling | Calibré pour 18–22px ; variant large pour 36+ | Inset/border-width ne scale pas linéairement |
| Cloud sync | Local state V2 ; backend hook Phase G+ | Pas bloquant pour rendu visuel |
| SystemMenu (CPU%) | Stub Phase C ; impl Phase G | Demande Rust commands `system_stats` |
| Resizers | Phase G | Pas critique pour first match visuel |
| Sidebar collapsed mode | Phase G | Pas critique pour first match visuel |
| Mock data sessions | Yes en Phase D, derrière `import.meta.env.DEV` flag | Backend refactor est en parallel separate PR |
| About dialog | Supprimer complètement | Mockup n'en a pas |
| Lucide-react | Supprimer dependency | Mockup utilise icon set custom; lucide-react est ~50KB inutilisée |
| Padding canvas | 8px (mockup exact) | Pas 24px comme V1 — bien plus serré |
| Sidebar width | 248px (mockup exact) | Pas 220px comme V1 |
| Inspector width | 360px (mockup exact) | Pas 320px comme V1 |
| Border-radius panels | 14px | Pas 16px comme V1 |
| Inspector flush vs floating | Flush right edge, left radius only | Confirmé par CSS mockup `border-radius: 0 14px 14px 0; border-left: 0` |
| MainPane bg | bg-terminal (oklch 0.135) | Pas popover (#181614) comme V1 — token explicite mockup |
| Body bg | #000 black | Outer rim autour de .app-frame (oklch 0.16) — crée un border subtil |
| Statusbar position | Bottom of MainPane (pas top) | Mockup pattern, libère le top pour le terminal pleine hauteur |
| Auto-spawn session | Opt-in (skip si project a déjà ≥1 session) | Évite double spawn, sessions multiples sous user control |
| ClaudeId display | mono 9.5px fg-3, strip "sess_" prefix | Mockup pattern |
| Project icon chip | inline style `color/background/border` from `project.color` + opacity hex suffix `40`/`60` | Pattern mockup, permet palette projets diversifiée |

Aucune question ouverte. Toutes les ambiguïtés sont tranchées sur le critère "fidélité au mockup source".

## Notes finales

- **Source de vérité** : si quelque chose dans cette spec semble ambigu, ouvre `/tmp/mockup-assets/_app.css` (CSS complète) ou les modules JSX `*.bin` correspondants. Tout est extrait, tout est lisible.
- **Validation visuelle** : avec un browser dispo, tu peux ouvrir `docs/mockup.html` directement (pas le `_template.html` extrait, le `mockup.html` original) — il render la vraie React app.
- **Si tu veux extraire toi-même les assets** : `bun run /tmp/extract-mockup.ts` (le script est en place, je l'ai écrit pendant l'audit V2).

Bonne implem. Si bloc rencontré ou décision à valider, ping `redesign` sur le bus.
