# Design spec — Phase 4.5 alignment pass

**Author:** `redesign` (Jacquouille bus) — 2026-05-25
**Target implementer:** `jacqline` agent
**Branch suggéré :** `feat/phase-4-5-design-pass`

## Sources

- **Mockup cible** : `docs/mockup.html` — SVG thumbnail (lignes 1–55) montre la composition canonique 1200×800.
- **Rendu actuel** : `src/components/{app-shell,projects-sidebar,main-pane,right-panel,terminal,new-project-dialog,jacqline-mark}.tsx` + `src/index.css`.
- **Tokens** : `src/index.css` `@theme` — couleurs/typo déjà alignées, ne pas y toucher.

## Constat global

Le rendu actuel est un **shell flush 3-pane** (`flex h-full w-full` avec `border-r` / `border-l` plats). La maquette est une composition **3 panneaux flottants sur canvas `#0a0a0a`** avec :

- Un **chrome top** qui héberge le brand mark (48px) à gauche, panneaux décalés en dessous.
- **Sidebar** flottante (radius complet, gap autour).
- **Terminal panel** centré, radius complet, surface plus sombre (`bg-popover`).
- **Inspector** ancré flush contre le bord droit, **radius gauche seulement** (effet "dock pulled-in").
- **Project chips** dans la sidebar (pill purple `primary/25` quand actif, surface raised `#262422` pour les inactifs) — pas des rows plates.

Couleurs et typo sont déjà bonnes. Le delta est **structurel + spacing + shapes**. C'est ce qui crée le sentiment d'être "loin de la maquette" malgré une palette correcte.

## Composants

### 1. `app-shell.tsx` — restructure (CRITIQUE)

**Avant :**
```tsx
<div className="flex h-full min-h-0 w-full">
  <ProjectsSidebar … />
  <MainPane />
  <RightPanel />
</div>
```

**Après :**
```tsx
<div className="bg-background flex h-full min-h-0 w-full flex-col">
  <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-4">
    <JacqlineMark size={40} />
    <span className="text-base font-semibold tracking-tight">Jacqline</span>
  </header>
  <div className="flex min-h-0 flex-1 gap-3 pl-6 pb-6">
    <ProjectsSidebar onNewProject={…} />
    <MainPane />
    <RightPanel />
  </div>
</div>
```

**Notes :**
- Le brand mark sort de la sidebar et remonte dans le chrome top à gauche (40–48px). Mockup montre 48px à `y=40`.
- Padding canvas : `pl-6 pb-6 pt-0` (top géré par header) + **pas de `pr-*`** sur le conteneur des panels — l'inspector est docké flush droite.
- Gap inter-panneaux : `gap-3` (12px). Mockup donne ~20px sur 1200, on compresse pour Tauri 1400×900 par défaut.
- `flex-col` au shell pour empiler header / panels.

### 2. `projects-sidebar.tsx` — panel flottant + project chips (CRITIQUE)

**Avant :**
```tsx
<aside className="bg-card border-border flex w-60 shrink-0 flex-col border-r">
  <header className="border-border flex items-center gap-2 border-b px-4 py-3">
    <JacqlineMark size={28} />
    <span className="font-semibold tracking-tight">Jacqline</span>
  </header>
  …
  <button className="hover:bg-popover rounded-md px-3 py-2 …
    activeId === p.id && 'bg-popover text-foreground'">
```

**Après :**
```tsx
<aside className="bg-card border-border flex w-[220px] shrink-0 flex-col rounded-2xl border">
  {/* PAS de header interne avec le mark — il est remonté dans AppShell */}
  <div className="flex-1 overflow-y-auto p-3">
    {projects.length === 0 ? (
      <p className="text-muted-foreground p-2 text-sm">No projects yet.</p>
    ) : (
      <ul className="space-y-1.5">
        {projects.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors",
                activeId === p.id
                  ? "bg-primary/25 text-foreground"
                  : "bg-popover/60 text-foreground/90 hover:bg-popover",
              )}
              onClick={() => setActive(p.id)}
            >
              <Folder
                className={cn(
                  "size-3.5 shrink-0",
                  activeId === p.id ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="truncate">{p.name}</span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
  <div className="border-border border-t p-3">
    <Button onClick={onNewProject} className="w-full">
      <Plus className="size-4" />
      New project
    </Button>
  </div>
</aside>
```

**Notes :**
- Width **220px** (vs 240px). Mockup = 200/1200 ≈ 16.7% ; en Tauri 1400 ≈ 234px ; 220 est un bon compromis lisibilité/dominance.
- `rounded-2xl` (16px) — pas `rounded-3xl` (24px). Mockup utilise rx=20 sur 1200, on compresse.
- `border` ajouté (la sidebar n'avait que `border-r`).
- **Project chips** : `h-9 rounded-lg` (10px), fond `bg-popover/60` pour les inactifs (surface raised au-dessus du card), fond `bg-primary/25` + icon `text-primary` pour l'actif.
- `space-y-1.5` (6px gap) entre chips. Mockup montre ~12px à l'échelle 1200 → 6–8px en compact.
- Le **header interne avec mark+wordmark est supprimé** (remonté dans `app-shell.tsx`). Garde uniquement la liste + le footer button.

### 3. `main-pane.tsx` — wrapper panel popover-deep (CRITIQUE)

**Avant :**
```tsx
<section className="flex min-w-0 flex-1 flex-col">
  <header className="border-border flex items-center gap-3 border-b px-4 py-3">
    <TerminalIcon className="text-muted-foreground size-4 shrink-0" />
    …
  </header>
  <div className="relative flex-1">
    …<Terminal />
  </div>
</section>
```

**Après :**
```tsx
<section className="bg-popover border-border flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border">
  <header className="border-border/60 flex items-center gap-3 border-b px-4 py-3">
    <TerminalIcon className="text-muted-foreground size-4 shrink-0" />
    <div className="min-w-0">
      <h2 className="truncate text-sm font-medium tracking-tight">{project.name}</h2>
      <p className="text-muted-foreground truncate font-mono text-xs">{project.cwd}</p>
    </div>
  </header>
  <div className="relative flex-1">
    {/* terminals as before */}
  </div>
</section>
```

**Notes :**
- Wrapper `bg-popover` (`#181614`) — c'est la surface deep du mockup pour le terminal panel.
- `rounded-2xl border overflow-hidden` — le terminal interne doit se clipper aux radius.
- Header borderline atténuée (`border-border/60`) — sinon trop marquée sur le fond plus sombre.
- `text-sm` sur le `h2` (au lieu de la taille `font-medium` par défaut) pour un header plus discret.
- **Empty state** (lignes 38–44) : remplacer la `<section>` racine par la même structure wrappée pour garder la cohérence visuelle quand aucun projet n'est sélectionné :
```tsx
<section className="bg-popover border-border flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border p-8 text-center">
  <TerminalIcon className="text-muted-foreground/40 size-12" />
  <p className="text-muted-foreground">Select a project or create a new one.</p>
</section>
```
- `SpawningState` et `ExitedBanner` (lignes 88–119) : remplacer `bg-popover/30` par `bg-card/40` puisque le wrapper est désormais `bg-popover` — sinon l'inner banner est invisible.

### 4. `terminal.tsx` — bg aligné avec wrapper

**Avant :**
```tsx
<div … style={{ backgroundColor: JACQLINE_THEME.background }} />
```

et `JACQLINE_THEME.background = "#0a0a0a"`.

**Après :**
- Remplacer `JACQLINE_THEME.background` par `"#181614"` (= `--color-popover`) pour matcher la surface du wrapper.
- Idem `cursorAccent: "#181614"`.
- Ajouter un padding visuel autour du terminal pour respirer (le mockup montre ~30px de padding interne). Wrapper supplémentaire :
```tsx
<div
  ref={containerRef}
  className={cn("h-full w-full overflow-hidden p-3", hidden && "hidden")}
  style={{ backgroundColor: JACQLINE_THEME.background }}
/>
```
ATTENTION : xterm.js veut un `getBoundingClientRect()` propre — si le padding casse le `FitAddon`, basculer sur un wrapper externe non-padded et garder xterm sur l'élément interne. Tester avec `bun run tauri dev` après changement.

### 5. `right-panel.tsx` — dock right, left radius only (CRITIQUE)

**Avant :**
```tsx
<aside className="bg-card border-border flex w-[380px] shrink-0 flex-col border-l">
```

**Après :**
```tsx
<aside className="bg-card border-border flex w-[320px] shrink-0 flex-col rounded-l-2xl border border-r-0">
  <Tabs defaultValue="files" className="flex flex-1 flex-col">
    <TabsList className="m-3 grid grid-cols-2">
      <TabsTrigger value="files" className="gap-2">
        <FileText className="size-4" />
        Files
      </TabsTrigger>
      <TabsTrigger value="inspector" className="gap-2">
        <FileSearch className="size-4" />
        Inspector
      </TabsTrigger>
    </TabsList>
    <TabsContent value="files" className="flex-1 px-4 py-3">
      <p className="text-muted-foreground text-sm">File browser coming in Phase 5.</p>
    </TabsContent>
    <TabsContent value="inspector" className="flex-1 px-4 py-3">
      <p className="text-muted-foreground text-sm">Project inspector coming in Phase 5+.</p>
    </TabsContent>
  </Tabs>
</aside>
```

**Notes :**
- Width **320px** (vs 380px). Mockup donne 300/1200 ≈ 25% → 350 sur 1400. 320 = plus lisible, garde de la place pour le terminal central.
- `rounded-l-2xl border border-r-0` : radius gauche seulement, border supprimé à droite (panneau flush contre le bord window).
- Aucun gap `pr-*` au niveau `app-shell.tsx` pour préserver le dock.
- `m-3` sur `TabsList` (au lieu de `m-2`) + `py-3` sur `TabsContent` — spacing plus généreux comme demandé dans le brief.

### 6. `jacqline-mark.tsx` — pas de change

Le mark est correct (geometry alignée mockup). Le seul changement le concernant est sa nouvelle taille (40–48px) et sa relocation dans `app-shell.tsx`.

### 7. `new-project-dialog.tsx` — micro-polish (NICE-TO-HAVE)

Le dialog hérite des shadcn defaults qui sont déjà sur les bonnes vars. Petits ajustements possibles :

- `DialogContent` actuellement défault — ajouter `className="sm:max-w-md"` pour limiter la largeur (sinon prend toute la modal).
- `DialogTitle` : ajouter `className="tracking-tight"` pour aligner sur le wordmark sidebar.
- L'input `font-mono flex-1 text-xs` du cwd est OK (mono pour les paths = règle SKILL.md).

Pas de change critique requis sur ce composant.

### 8. `src/index.css` — pas de change

Les tokens `@theme` matchent déjà la palette mockup. Vérifié :
- `--color-background: oklch(0.04 0 0)` ≈ `#0a0a0a` ✓
- `--color-card: oklch(0.13 0.005 30)` ≈ `#1f1d1c` ✓
- `--color-popover: oklch(0.11 0.005 30)` ≈ `#181614` ✓
- `--color-border: oklch(0.18 0.003 30)` ≈ `#2e2b29` ✓
- `--color-primary: oklch(0.55 0.2 285)` ≈ `#7c3aed` ✓

## Priorités

### Critique (impact UX immédiat — à faire en premier)

1. **`app-shell.tsx`** : restructure en `flex-col` avec header chrome + canvas avec padding asymétrique (`pl-6 pb-6`).
2. **`projects-sidebar.tsx`** : `rounded-2xl`, suppression header interne, **project chips** (`bg-primary/25` actif / `bg-popover/60` inactif).
3. **`main-pane.tsx`** : wrapper `bg-popover rounded-2xl border overflow-hidden`.
4. **`right-panel.tsx`** : `rounded-l-2xl border border-r-0`, width 320px.

Ces 4 changements donnent **immédiatement** la sensation de "panneaux flottants sur canvas dark" qui est la signature visuelle du mockup.

### Nice-to-have (cosmétique, peut suivre en patch séparé)

5. **`terminal.tsx`** : bg theme aligné `#181614` + padding interne (vérifier compat xterm `FitAddon`).
6. **`main-pane.tsx`** banners `bg-popover/30` → `bg-card/40` (cohérence sur le nouveau fond).
7. **`new-project-dialog.tsx`** : `sm:max-w-md` + tracking-tight sur le titre.

## Questions ouvertes (arbitrage recommandé)

1. **Inspector flush ou floating ?** Le mockup SVG thumbnail dessine l'inspector avec un gap 20px à droite (sharp-corner rect). Le brief orchestrator dit "docked à droite (sans radius droit)". J'ai tranché pour **flush + rounded-left-only** car c'est la lecture la plus cohérente avec le wording "docked". Si l'intent réel est "floating mais sans rounded-right", changer en `rounded-l-2xl` + garder un `pr-6` au shell.

2. **Taille du brand mark dans le chrome** : 40 ou 48px ? Mockup = 48px sur 1200 ; en Tauri 1400 ça reste 48px (taille absolue). J'ai recommandé 40px pour ne pas dominer un chrome compact ; mais 48px est défendable si on veut fidélité 1:1.

3. **Width sidebar 220 ou 240px ?** J'ai pris 220px (plus proche du ratio mockup). Si la lisibilité des noms de projet souffre, remonter à 240px sans drame.

4. **Padding canvas (`pl-6 pb-6`) sur le shell** : équivalent 24px. Mockup montre 80px sur 1200 ≈ 6.7% ; en 1400 ça ferait 93px ce qui est énorme. 24–32px est le sweet-spot pour un chrome desktop crédible. Si tu veux plus aérien, passer à `pl-8 pb-8` (32px).

## Vérification visuelle attendue (après implem)

- [ ] Brand mark visible dans le chrome top-left (pas dans la sidebar)
- [ ] Sidebar a 4 coins arrondis (pas flush)
- [ ] Project actif = chip purple semi-transparent (pas une row plate)
- [ ] Terminal entouré d'une carte sombre arrondie (visible vs le fond `#0a0a0a`)
- [ ] Inspector flush contre le bord droit window mais avec coins gauches arrondis
- [ ] Gap visible (12px) entre sidebar / terminal / inspector
- [ ] Pas de `border-r` / `border-l` plats sur les panneaux (tout en `border` complet, sauf l'inspector qui a `border-r-0`)

Quand ces 7 critères sont OK : la maquette est rejointe sur le plan structurel. Restera à itérer sur les détails internes (Files browser, Inspector contenu) en Phase 5+.
