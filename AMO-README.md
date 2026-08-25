# Build Instructions: Qwant Results Filter

This document provides instructions for Mozilla Add-ons reviewers to reproduce the build of the Qwant Results Filter extension from its source code.

The extension relies on a build step to dynamically fetch community blocklists and generate a static JavaScript module (`src/js/modules/presets.js`) before packaging.

## Prerequisites

To build this extension, you will need the following installed on your system:

- **Node.js** (v18 or higher recommended)
- **npm** (Node Package Manager)

## Build Steps

Please follow these steps to build the extension from the provided source code archive:

### 1. Extract the source code:

Unzip the provided source code archive and navigate into the root directory of the project using your terminal.

### 2. Install dependencies:

Run the following command to install the required development dependencies (such as `web-ext`, `eslint`, `prettier`, and `js-yaml`):

```bash
npm ci
```

### 3. Build the extension:

Execute the build script:

```bash
npm run build
```

This will execute the following sequence:

1. **`npm run generate`**:  
   Runs `scripts/fetch-presets.mjs` via Node.  
   This fetches the latest uBlacklist community YAML file, validates the lists, and generates the static `src/js/modules/presets.js` file. It then formats the generated file using Prettier.
2. **`npm run lint`**:  
   Checks the codebase using ESLint, Prettier, and `web-ext lint`.
   _You can run `npm run lint:fix` to automatically fix any code styling issues issues._
3. **`web-ext build`**:  
   Packages the contents of the `src/` directory into a deployable `.zip` file inside the `dist/` folder.
