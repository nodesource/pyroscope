# N|Solid Pyroscope embed

`Pyroscope` renders a `FlamebearerProfile`. Import the package stylesheet with
`@ns-private/pyroscope/style.css` alongside the component.

`showCopyFunction?: boolean` controls the frame menu's copy action and defaults to
`true`. The console passes `showCopyFunction={!isEbpfProfile}` to keep copying in
the Function details modal for eBPF while preserving the menu action for normal
CPU profiles. This setting works independently of `onFrameDetails`, including
when details are disabled or loading.

## Function details

The optional host callback adds **Function details** to the frame context menu:

```ts
onFrameDetails?: (selection: {
  name: string;
  callSite: Array<{ name: string; nameIndex: number }>;
}) => void;
```

The host supplies this callback only for eBPF profiles and owns the modal and
queries. The embed does not detect the profile type or request function details.

`callSite` contains the complete stack from the original root to the selected
frame, including the selected frame, even after focus/zoom. The synthetic
level-zero `total` root is excluded; real functions named `total` are retained.
Each `name` is exactly the corresponding string supplied in `flamebearer.names`,
and `nameIndex` is its index in that original array, not a DataFrame row index.
If the host normalized display names, it can map `nameIndex` to its parallel
`data.ebpfOriginalNames` array before constructing the query selector. Recursion
and equal display names in different branches retain their separate stack entries.

The action is absent without a callback, on the synthetic root, or on a Sandwich
view frame that merges different stack selectors. Merged occurrences sharing
the same selector still support details. Selecting the action closes the menu
and invokes the callback once.

For a collapsed chain, the selected frame is its leading function; expand the
group to select hidden functions individually. A group led by synthetic `total`
therefore has no details action until expanded. Frames below collapsed groups
still include every original ancestor in their selectors. Top Table has no frame
context menu, and this renderer does not include a CallTree view.

## Local console testing

From `ui/`, build and pack the local changes:

```sh
yarn workspace @ns-private/pyroscope type-check
yarn workspace @ns-private/pyroscope test
yarn workspace @ns-private/pyroscope build
yarn workspace @ns-private/pyroscope pack --out /tmp/ns-pyroscope-ebpf-function-details.tgz
```

In the console repository, install that tarball with its package manager using
`file:/tmp/ns-pyroscope-ebpf-function-details.tgz` as the dependency source for
`@ns-private/pyroscope`. This tests `dist/index.js`, `dist/index.d.ts` and the scoped
`dist/style.css` while resolving React and ReactDOM from the host installation.
Rebuild and repack after further UI changes. Local packing leaves the package
version unchanged and does not publish to a registry.

The package's browser tests run with
`yarn workspace @ns-private/pyroscope e2e` from `ui/` and cover callback visibility,
stack selection after focus, recursion, and existing embed scrolling/refresh behavior.
