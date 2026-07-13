# Changelog

## [0.32.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.31.0...modbus2mqtt-v0.32.0) (2026-07-13)


### Features

* add per-slave maxRegistersPerRequest for Modbus read chunking ([#283](https://github.com/modbus2mqtt/modbus2mqtt/issues/283)) ([76c4170](https://github.com/modbus2mqtt/modbus2mqtt/commit/76c4170e5bdc8e9a0ffef337eb13101e92599317))
* configurable serial framing (data bits, parity, stop bits) ([#292](https://github.com/modbus2mqtt/modbus2mqtt/issues/292)) ([4252605](https://github.com/modbus2mqtt/modbus2mqtt/commit/42526050114aabd222b9582b548b9b4f23b477b2))


### Bug Fixes

* a slave that cannot be polled says so in Status & Errors ([#294](https://github.com/modbus2mqtt/modbus2mqtt/issues/294)) ([f48804f](https://github.com/modbus2mqtt/modbus2mqtt/commit/f48804fc8c5afaf525f44dba41f25df17750c8db))
* **devcontainer:** make the devcontainer work with pnpm + Node 22 ([#281](https://github.com/modbus2mqtt/modbus2mqtt/issues/281)) ([184951b](https://github.com/modbus2mqtt/modbus2mqtt/commit/184951b0069c42288b76b073b9a51210fd1be154))
* honour swapWords/swapBytes and keep the last value on a failed poll ([#291](https://github.com/modbus2mqtt/modbus2mqtt/issues/291)) ([2fba5d2](https://github.com/modbus2mqtt/modbus2mqtt/commit/2fba5d24b16462f43b8b75e01e1e2da2a3a511e2))
* render slave list reliably under zoneless change detection ([#282](https://github.com/modbus2mqtt/modbus2mqtt/issues/282)) ([cd3fb61](https://github.com/modbus2mqtt/modbus2mqtt/commit/cd3fb6104b48360eac82d8a79b013d1371a53613))

## [0.31.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.30.0...modbus2mqtt-v0.31.0) (2026-07-13)


### Features

* report mqtt/http push failures per slave and trigger a test poll from the UI ([#288](https://github.com/modbus2mqtt/modbus2mqtt/issues/288)) ([972c64a](https://github.com/modbus2mqtt/modbus2mqtt/commit/972c64a89a460ee667b9d5517e5ba07d88819431))

## [0.30.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.29.0...modbus2mqtt-v0.30.0) (2026-07-13)


### Features

* slave references - inherit a slave's configuration on the same bus ([#286](https://github.com/modbus2mqtt/modbus2mqtt/issues/286)) ([6663336](https://github.com/modbus2mqtt/modbus2mqtt/commit/66633369617a47c89c05881c8cbfda135d820475))

## [0.29.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.28.0...modbus2mqtt-v0.29.0) (2026-07-13)


### Features

* add {{ slaveName }} URL placeholder for HTTP push ([#284](https://github.com/modbus2mqtt/modbus2mqtt/issues/284)) ([5814732](https://github.com/modbus2mqtt/modbus2mqtt/commit/58147325592fad5e8a3277e7d52bdd40c6d97580))

## [0.28.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.27.1...modbus2mqtt-v0.28.0) (2026-07-10)


### Features

* add {{ pollDate }} URL placeholder for HTTP push ([#279](https://github.com/modbus2mqtt/modbus2mqtt/issues/279)) ([91a3749](https://github.com/modbus2mqtt/modbus2mqtt/commit/91a3749fc7241a14b22c393256353e0a2ad83504))

## [0.27.1](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.27.0...modbus2mqtt-v0.27.1) (2026-07-10)


### Bug Fixes

* live-update HTTP push body preview under zoneless CD ([#277](https://github.com/modbus2mqtt/modbus2mqtt/issues/277)) ([6c18be0](https://github.com/modbus2mqtt/modbus2mqtt/commit/6c18be01232c610a0a539d2171fe9192b4a0d5a3))

## [0.27.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.26.1...modbus2mqtt-v0.27.0) (2026-07-10)


### Features

* POST Body Example preview in slave HTTP Push section ([#274](https://github.com/modbus2mqtt/modbus2mqtt/issues/274)) ([bd0f7d9](https://github.com/modbus2mqtt/modbus2mqtt/commit/bd0f7d94d9e24ee9ded16a886399ed78ab742cc9))

## [0.26.1](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.26.0...modbus2mqtt-v0.26.1) (2026-07-10)


### Bug Fixes

* small entity/MQTT-ID UI fixes ([#272](https://github.com/modbus2mqtt/modbus2mqtt/issues/272)) ([43435fd](https://github.com/modbus2mqtt/modbus2mqtt/commit/43435fd77abea819570cc2bd81956989af6e3ae4))

## [0.26.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.9...modbus2mqtt-v0.26.0) (2026-07-10)


### Features

* HTTP push of slave readings with cron-based poll scheduling ([#254](https://github.com/modbus2mqtt/modbus2mqtt/issues/254)) ([c39e1ba](https://github.com/modbus2mqtt/modbus2mqtt/commit/c39e1bac96b7b6d3503eb2cd184892255957d20f))


### Bug Fixes

* harden MQTT error handling and HTTP redirect, fix frontend debug base href ([#266](https://github.com/modbus2mqtt/modbus2mqtt/issues/266)) ([ced820c](https://github.com/modbus2mqtt/modbus2mqtt/commit/ced820cd5ab6dd2437abe071b61790ff7d9dcb3a))

## [0.25.9](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.8...modbus2mqtt-v0.25.9) (2026-07-10)


### Bug Fixes

* sort slaves numerically by slaveid ([#269](https://github.com/modbus2mqtt/modbus2mqtt/issues/269)) ([eb72a4f](https://github.com/modbus2mqtt/modbus2mqtt/commit/eb72a4f3e05055fcad75ff29b01244e700373f21))

## [0.25.8](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.7...modbus2mqtt-v0.25.8) (2026-07-09)


### Performance

* decouple slaves from specifications in the HTTP API ([#267](https://github.com/modbus2mqtt/modbus2mqtt/issues/267)) ([6b8f976](https://github.com/modbus2mqtt/modbus2mqtt/commit/6b8f9763c7d6704baecb75a0257835ce8981f449))

## [0.25.7](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.6...modbus2mqtt-v0.25.7) (2026-07-09)


### Bug Fixes

* show error when new slave uses an existing slave id ([#264](https://github.com/modbus2mqtt/modbus2mqtt/issues/264)) ([ee849cb](https://github.com/modbus2mqtt/modbus2mqtt/commit/ee849cb61412ea19733bfa54d85b730edb01c0b3))

## [0.25.6](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.5...modbus2mqtt-v0.25.6) (2026-07-04)


### Refactoring

* decompose m2mspecification.ts into single-concern modules ([#262](https://github.com/modbus2mqtt/modbus2mqtt/issues/262)) ([22e35a1](https://github.com/modbus2mqtt/modbus2mqtt/commit/22e35a1eb542ba1c6143e0058b29d7c8e795aa3b))

## [0.25.5](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.4...modbus2mqtt-v0.25.5) (2026-07-04)


### Refactoring

* modular HTTP layer with full route test coverage ([#259](https://github.com/modbus2mqtt/modbus2mqtt/issues/259)) ([f8c2f7f](https://github.com/modbus2mqtt/modbus2mqtt/commit/f8c2f7fba3c4fc6e90ae64d44e68a0f9a45c89f9))

## [0.25.4](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.3...modbus2mqtt-v0.25.4) (2026-06-26)


### Bug Fixes

* display specification documents (PDF) via blob URL ([#257](https://github.com/modbus2mqtt/modbus2mqtt/issues/257)) ([887f8d1](https://github.com/modbus2mqtt/modbus2mqtt/commit/887f8d16ffcc1153e98a4c135899887c539a3d2d))

## [0.25.3](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.2...modbus2mqtt-v0.25.3) (2026-06-17)


### Bug Fixes

* default modbus bus timeout to 1000ms (TCP defaulted to 100ms) ([#255](https://github.com/modbus2mqtt/modbus2mqtt/issues/255)) ([ae8cbfd](https://github.com/modbus2mqtt/modbus2mqtt/commit/ae8cbfd67d09fb2ce8f7b4fee0b6d59241eec5ef))

## [0.25.2](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.1...modbus2mqtt-v0.25.2) (2026-06-17)


### Bug Fixes

* OIDC CORS origin + harden MQTT publishState ([#252](https://github.com/modbus2mqtt/modbus2mqtt/issues/252)) ([aba1e83](https://github.com/modbus2mqtt/modbus2mqtt/commit/aba1e837e8dc4a81e3c9e4b41757f5093fab62bc))

## [0.25.1](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.25.0...modbus2mqtt-v0.25.1) (2026-06-06)


### Bug Fixes

* add cloning of public files in M2mGitHub when directory is empty ([#250](https://github.com/modbus2mqtt/modbus2mqtt/issues/250)) ([5eb4c1b](https://github.com/modbus2mqtt/modbus2mqtt/commit/5eb4c1b74be3e39ed7a2ec77af31db5a067d1f40))

## [0.25.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.24.0...modbus2mqtt-v0.25.0) (2026-06-06)


### Features

* implement SSL file listing and reading functionality in ConfigPersistence ([0af6f1c](https://github.com/modbus2mqtt/modbus2mqtt/commit/0af6f1ce8f091e80be6ea92d738c94665ade1453))


### Refactoring

* improve Modbus client connection handling and error management ([#248](https://github.com/modbus2mqtt/modbus2mqtt/issues/248)) ([5a45cbb](https://github.com/modbus2mqtt/modbus2mqtt/commit/5a45cbb28747921c8c3d76f63232b79a8a919b1d))

## [0.24.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.23.0...modbus2mqtt-v0.24.0) (2026-05-05)


### Features

* import local dir rest api ([#242](https://github.com/modbus2mqtt/modbus2mqtt/issues/242)) ([1f204cf](https://github.com/modbus2mqtt/modbus2mqtt/commit/1f204cf4d7d5a52b819e5f15e7d2a23d71c9aa77))

## [0.23.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.22.0...modbus2mqtt-v0.23.0) (2026-05-05)


### Features

* discovery hardware version  ([#240](https://github.com/modbus2mqtt/modbus2mqtt/issues/240)) ([33aa7fb](https://github.com/modbus2mqtt/modbus2mqtt/commit/33aa7fb5c78e036bf2d2a0e10544af86587c2d0b))

## [0.22.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.21.0...modbus2mqtt-v0.22.0) (2026-05-05)


### Features

* import local dir rest api ([#238](https://github.com/modbus2mqtt/modbus2mqtt/issues/238)) ([47ade3d](https://github.com/modbus2mqtt/modbus2mqtt/commit/47ade3d57464cd1782625d2b0715af5a0ae3720d))

## [0.21.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.20.0...modbus2mqtt-v0.21.0) (2026-04-22)


### Features

* **auth:** implement structured error logging and OIDC failure handling ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))
* auto-detect HTTPS certificates in /ssl directory ([6a2c86f](https://github.com/modbus2mqtt/modbus2mqtt/commit/6a2c86f85d287751a2541ac75424e228f0bcf5b0))
* **discovery:** add hw_version + configuration_url and fix post-poll republish ([#228](https://github.com/modbus2mqtt/modbus2mqtt/issues/228)) ([#234](https://github.com/modbus2mqtt/modbus2mqtt/issues/234)) ([fbea618](https://github.com/modbus2mqtt/modbus2mqtt/commit/fbea618d15d91e16270624c8e2dbb7054e7e7281))
* **git:** add scripts for branch management and PR creation ([ba3a3ce](https://github.com/modbus2mqtt/modbus2mqtt/commit/ba3a3ced16434a9b73daa6661cb57662cbf17f09))
* https Support implemented ([4813e03](https://github.com/modbus2mqtt/modbus2mqtt/commit/4813e03c06f2abe32450aea89370e0f8c2c07b53))
* integrate OIDC authentication with Zitadel ([2e261f9](https://github.com/modbus2mqtt/modbus2mqtt/commit/2e261f9d29ca4e283e703b165e33643e14b84adc))
* **modbus2mqtt:** update Docker image references and documentation ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))


### Bug Fixes

* **announcements:** update breaking change message for OIDC transition ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))
* **zitadel-script:** update default callback URLs for OIDC ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))


### Miscellaneous

* **package:** update repository links in package.json ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))
* **workspace:** add build task for modbus2mqtt ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))


### Documentation

* **authentication:** add comprehensive authentication setup guide ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))
* **getting-started:** correct GitHub issue links ([538d246](https://github.com/modbus2mqtt/modbus2mqtt/commit/538d246f11a0329f704c1ecd9979d0eb50c2628a))

## [0.20.0](https://github.com/modbus2mqtt/modbus2mqtt/compare/modbus2mqtt-v0.19.0...modbus2mqtt-v0.20.0) (2026-02-25)


### Features

* add cleanup logic for mqttDiscoverTestHelper after tests ([c3de781](https://github.com/modbus2mqtt/modbus2mqtt/commit/c3de781e939385c52512b1329aa6349140010507))
* add Vitest support and mutation detection script ([634d1fc](https://github.com/modbus2mqtt/modbus2mqtt/commit/634d1fc4ed5f9deaca540774e170748b826e7d40))
* **backend:** add backend configs, move tests, spec package scaffolding; build/test/lint wiring\n\n- Backend: package.json, tsconfigs, vitest + eslint setup\n- Tests: moved to backend/tests with shims + aliases\n- SPEC: ESM package scaffolding via symlinks + tsconfig\n- Frontend: rename angular-&gt;frontend; config and build path updates\n- Lint: fix rule reference for unused-vars in types.ts ([28a714f](https://github.com/modbus2mqtt/modbus2mqtt/commit/28a714fda67f04f6cfb925e757a2535bd1f4c5a8))
* enhance temp directory management and add test scripts for specification package ([34aef13](https://github.com/modbus2mqtt/modbus2mqtt/commit/34aef13cbb451d0d043787bb30412da0d2acfb9a))
* Introduce new specification module with message types and validation functions ([d7b9c0a](https://github.com/modbus2mqtt/modbus2mqtt/commit/d7b9c0a2f918efd09ecdc70925e89d78a9a79fc2))
* update launch configuration and improve test scripts ([c8dc50a](https://github.com/modbus2mqtt/modbus2mqtt/commit/c8dc50ae4c3a75729ca5d372a0731bb9b49ed765))


### Bug Fixes

* **backend:** increased payload limit to 50MB for issue  ([#213](https://github.com/modbus2mqtt/modbus2mqtt/issues/213)) ([edb4e4a](https://github.com/modbus2mqtt/modbus2mqtt/commit/edb4e4a3f7f0cda0d3cb75c9754af999e427a4e8))
* **ci:** quote cleanup workflow names; remove duplicate release-assets.yml ([68c1bb7](https://github.com/modbus2mqtt/modbus2mqtt/commit/68c1bb7e5dfe6b7e42ac7e845d6e5d524aa59a00))
* **ci:** quote workflow and job names with colons to satisfy YAML parser ([2c50620](https://github.com/modbus2mqtt/modbus2mqtt/commit/2c506208b8cdf4c005769375bbae26f6adc89919))
* **ci:** repair release workflow graph by removing stale needs.prepare references ([77e1e81](https://github.com/modbus2mqtt/modbus2mqtt/commit/77e1e816b05a630544c0edd2702c42b6f2ef15b7))
* devices now poll continuously instead of only once ([941afa3](https://github.com/modbus2mqtt/modbus2mqtt/commit/941afa338b6fdc971994e656d69ea2864dc55a4c))
* remove incorrect global Array interface augmentation to resolve TypeScript compile errors ([b30b45c](https://github.com/modbus2mqtt/modbus2mqtt/commit/b30b45c05d86c3225b318ab0f8db831f3b191265))
* update package.json exports and improve test script for validate.js verification ([e713204](https://github.com/modbus2mqtt/modbus2mqtt/commit/e7132048c25585bec96bf39f36f256645898c820))
* update target path in find-mutating-test script ([5e74233](https://github.com/modbus2mqtt/modbus2mqtt/commit/5e74233bbdd0b3db9229e3952c5e793062e4f14f))


### Miscellaneous

* **ci:** align publish-npm with .nvmrc; fix references; add scheduled cleanup and retention ([8d22bf0](https://github.com/modbus2mqtt/modbus2mqtt/commit/8d22bf0f930298ee88c660816c2b0779643a3b97))
* **ci:** rename release workflow and align names/outputs; add PR pre-commit check; split enforce-english workflows; delete legacy workflows ([52bccf2](https://github.com/modbus2mqtt/modbus2mqtt/commit/52bccf2320685f405feac93cb954fdc2e0bfae33))
* **ci:** shorten workflow filenames and align names/jobs (release-assets-on-dispatch, cleanup-on-schedule); update references ([8c270df](https://github.com/modbus2mqtt/modbus2mqtt/commit/8c270dfa898a45e70785f4576d870d9da1bed62a))
* **eslint:** point test overrides to backend/tests and trim tsconfig.eslint include ([cd96a1a](https://github.com/modbus2mqtt/modbus2mqtt/commit/cd96a1a8b804363b10caaeaf6ec99c928da7c21c))
* **main:** release modbus2mqtt 0.19.0 ([346ce38](https://github.com/modbus2mqtt/modbus2mqtt/commit/346ce386a2ffc1842dbab53e7ef50c33915d3584))
* **repo:** purge root angular/vitest/jest configs and symlinks; use FE/BE local configs only ([15119fa](https://github.com/modbus2mqtt/modbus2mqtt/commit/15119fadd514157d7d1d3527019c9413488376d9))
* **repo:** remove root symlinks and obsolete configs (jest, vitest, angular, tsconfig.server) after FE/BE split ([f2b4298](https://github.com/modbus2mqtt/modbus2mqtt/commit/f2b4298a97c2c822309ee8840cd3270d094e5753))
* update package version to 0.17.2 and adjust npm package name handling ([8abde3b](https://github.com/modbus2mqtt/modbus2mqtt/commit/8abde3b63c8e5a30382e1aaec966a7233927fa87))
* update vitest to version 4.0.12 and include vitest config in ESLint tsconfig ([9d3dfb2](https://github.com/modbus2mqtt/modbus2mqtt/commit/9d3dfb264bddaa057ad089240ff40e428844d5fc))


### Refactoring

* Change variable declarations from 'let' to 'const' for better code clarity and immutability ([4399b76](https://github.com/modbus2mqtt/modbus2mqtt/commit/4399b76c31ec909ed70ba93653a643da879cd604))
* improve error handling and validation in HttpServer, update Cypress tests, and enhance package validation script ([8448510](https://github.com/modbus2mqtt/modbus2mqtt/commit/844851074887c1df4237ce94788843dc8c012658))
* replace tcpBridge with tcpBridgePort and update related logic ([f4051b1](https://github.com/modbus2mqtt/modbus2mqtt/commit/f4051b1c20f1702e0508157e56c8c8f6b746213c))
* **repo:** rename angular-&gt;frontend and src-&gt;backend/src; initial test relocation ([9cfc316](https://github.com/modbus2mqtt/modbus2mqtt/commit/9cfc316552be377673fc01e2ec4e2f67c259cdd2))
* streamline conditional statements and improve code formatting in spec.cy.js ([c2c63b7](https://github.com/modbus2mqtt/modbus2mqtt/commit/c2c63b711844ee6ae47349f23915e1f551787f3c))
* update CI workflow and improve logging for server scripts ([dee536a](https://github.com/modbus2mqtt/modbus2mqtt/commit/dee536ad381060573f0d1c460e338928d53bf1a2))

## [0.19.0](https://github.com/volkmarnissen/modbus2mqtt/compare/modbus2mqtt-v0.18.0...modbus2mqtt-v0.19.0) (2026-02-23)


### Features

* add cleanup logic for mqttDiscoverTestHelper after tests ([c3de781](https://github.com/volkmarnissen/modbus2mqtt/commit/c3de781e939385c52512b1329aa6349140010507))
* add Vitest support and mutation detection script ([634d1fc](https://github.com/volkmarnissen/modbus2mqtt/commit/634d1fc4ed5f9deaca540774e170748b826e7d40))
* **backend:** add backend configs, move tests, spec package scaffolding; build/test/lint wiring\n\n- Backend: package.json, tsconfigs, vitest + eslint setup\n- Tests: moved to backend/tests with shims + aliases\n- SPEC: ESM package scaffolding via symlinks + tsconfig\n- Frontend: rename angular-&gt;frontend; config and build path updates\n- Lint: fix rule reference for unused-vars in types.ts ([28a714f](https://github.com/volkmarnissen/modbus2mqtt/commit/28a714fda67f04f6cfb925e757a2535bd1f4c5a8))
* enhance temp directory management and add test scripts for specification package ([34aef13](https://github.com/volkmarnissen/modbus2mqtt/commit/34aef13cbb451d0d043787bb30412da0d2acfb9a))
* Introduce new specification module with message types and validation functions ([d7b9c0a](https://github.com/volkmarnissen/modbus2mqtt/commit/d7b9c0a2f918efd09ecdc70925e89d78a9a79fc2))
* update launch configuration and improve test scripts ([c8dc50a](https://github.com/volkmarnissen/modbus2mqtt/commit/c8dc50ae4c3a75729ca5d372a0731bb9b49ed765))


### Bug Fixes

* **backend:** increased payload limit to 50MB for issue  ([#213](https://github.com/volkmarnissen/modbus2mqtt/issues/213)) ([edb4e4a](https://github.com/volkmarnissen/modbus2mqtt/commit/edb4e4a3f7f0cda0d3cb75c9754af999e427a4e8))
* **ci:** quote cleanup workflow names; remove duplicate release-assets.yml ([68c1bb7](https://github.com/volkmarnissen/modbus2mqtt/commit/68c1bb7e5dfe6b7e42ac7e845d6e5d524aa59a00))
* **ci:** quote workflow and job names with colons to satisfy YAML parser ([2c50620](https://github.com/volkmarnissen/modbus2mqtt/commit/2c506208b8cdf4c005769375bbae26f6adc89919))
* **ci:** repair release workflow graph by removing stale needs.prepare references ([77e1e81](https://github.com/volkmarnissen/modbus2mqtt/commit/77e1e816b05a630544c0edd2702c42b6f2ef15b7))
* devices now poll continuously instead of only once ([941afa3](https://github.com/volkmarnissen/modbus2mqtt/commit/941afa338b6fdc971994e656d69ea2864dc55a4c))
* remove incorrect global Array interface augmentation to resolve TypeScript compile errors ([b30b45c](https://github.com/volkmarnissen/modbus2mqtt/commit/b30b45c05d86c3225b318ab0f8db831f3b191265))
* update package.json exports and improve test script for validate.js verification ([e713204](https://github.com/volkmarnissen/modbus2mqtt/commit/e7132048c25585bec96bf39f36f256645898c820))
* update target path in find-mutating-test script ([5e74233](https://github.com/volkmarnissen/modbus2mqtt/commit/5e74233bbdd0b3db9229e3952c5e793062e4f14f))


### Miscellaneous

* **ci:** align publish-npm with .nvmrc; fix references; add scheduled cleanup and retention ([8d22bf0](https://github.com/volkmarnissen/modbus2mqtt/commit/8d22bf0f930298ee88c660816c2b0779643a3b97))
* **ci:** rename release workflow and align names/outputs; add PR pre-commit check; split enforce-english workflows; delete legacy workflows ([52bccf2](https://github.com/volkmarnissen/modbus2mqtt/commit/52bccf2320685f405feac93cb954fdc2e0bfae33))
* **ci:** shorten workflow filenames and align names/jobs (release-assets-on-dispatch, cleanup-on-schedule); update references ([8c270df](https://github.com/volkmarnissen/modbus2mqtt/commit/8c270dfa898a45e70785f4576d870d9da1bed62a))
* **eslint:** point test overrides to backend/tests and trim tsconfig.eslint include ([cd96a1a](https://github.com/volkmarnissen/modbus2mqtt/commit/cd96a1a8b804363b10caaeaf6ec99c928da7c21c))
* **repo:** purge root angular/vitest/jest configs and symlinks; use FE/BE local configs only ([15119fa](https://github.com/volkmarnissen/modbus2mqtt/commit/15119fadd514157d7d1d3527019c9413488376d9))
* **repo:** remove root symlinks and obsolete configs (jest, vitest, angular, tsconfig.server) after FE/BE split ([f2b4298](https://github.com/volkmarnissen/modbus2mqtt/commit/f2b4298a97c2c822309ee8840cd3270d094e5753))
* update package version to 0.17.2 and adjust npm package name handling ([8abde3b](https://github.com/volkmarnissen/modbus2mqtt/commit/8abde3b63c8e5a30382e1aaec966a7233927fa87))
* update vitest to version 4.0.12 and include vitest config in ESLint tsconfig ([9d3dfb2](https://github.com/volkmarnissen/modbus2mqtt/commit/9d3dfb264bddaa057ad089240ff40e428844d5fc))


### Refactoring

* Change variable declarations from 'let' to 'const' for better code clarity and immutability ([4399b76](https://github.com/volkmarnissen/modbus2mqtt/commit/4399b76c31ec909ed70ba93653a643da879cd604))
* improve error handling and validation in HttpServer, update Cypress tests, and enhance package validation script ([8448510](https://github.com/volkmarnissen/modbus2mqtt/commit/844851074887c1df4237ce94788843dc8c012658))
* replace tcpBridge with tcpBridgePort and update related logic ([f4051b1](https://github.com/volkmarnissen/modbus2mqtt/commit/f4051b1c20f1702e0508157e56c8c8f6b746213c))
* **repo:** rename angular-&gt;frontend and src-&gt;backend/src; initial test relocation ([9cfc316](https://github.com/volkmarnissen/modbus2mqtt/commit/9cfc316552be377673fc01e2ec4e2f67c259cdd2))
* streamline conditional statements and improve code formatting in spec.cy.js ([c2c63b7](https://github.com/volkmarnissen/modbus2mqtt/commit/c2c63b711844ee6ae47349f23915e1f551787f3c))
* update CI workflow and improve logging for server scripts ([dee536a](https://github.com/volkmarnissen/modbus2mqtt/commit/dee536ad381060573f0d1c460e338928d53bf1a2))
