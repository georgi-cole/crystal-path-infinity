# Работа по задачите

Един branch и PR за конкретна задача с проверими критерии. CPI-001 е приет; след merge на PR #40 Georgi разреши CPI-003, като оставащите device/SSV/backend проверки се запазват в CPI-002.

- PR обяснява проблема, промененото поведение, проверките и ограниченията.
- Не променяме bbmobilenew-source като страничен ефект.
- Правилата имат версия; несъвместими резултати не се смесват.
- Mock реклами и произволни клиентски scores не са официални награди/рекорди.
- Тайни, signing материали, service-role ключове и лични данни не влизат в git.
- Проверка на планирането: `python3 scripts/validate_plan.py` и `python3 -m unittest discover -s scripts -p 'test_*.py'`.
- Проверка на приложението от корена: `npm ci --ignore-scripts`, `npm run typecheck`, `npm test` и build командата за променената среда. Виж `apps/mobile/README.md` за native generation и launch evidence.
- CPI-003 добавя основните app typecheck/configuration/web/native checks. CPI-004 разширява lint/core/API gates и настройва изискваните branch checks след стабилизиране на scaffold-а.

Done означава изпълнени критерии и демо или възпроизводима проверка. Planning CI проверява планирането; отделният app workflow проверява компилация и минимално отваряне. Emulator/Simulator резултатите не заместват проверки на физически устройства, реклами или backend.
