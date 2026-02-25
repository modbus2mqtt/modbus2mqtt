# Changelog

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
