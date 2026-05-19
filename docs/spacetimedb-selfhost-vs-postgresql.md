# SpacetimeDB self-host vs PostgreSQL для Elmental V2

Дата: 2026-05-18

## Короткий вывод

SpacetimeDB self-host можно оставить как временный backend для публичного mechanics-test, потому что текущий игровой путь уже построен вокруг reducers, таблиц и realtime subscriptions. Это снижает объем немедленной разработки и сохраняет текущую модель "frontend подписывается на серверное состояние".

Но для production-grade платной экономики SpacetimeDB self-host нужно считать рискованной ставкой, пока не доказаны backup/restore, контроль доступа, платежный токен, наблюдаемость и процедура восстановления. PostgreSQL с обычным backend-сервисом выглядит скучнее, но рационально надежнее как система учета денег, аудита, балансов, спорных операций и восстановления после ошибок.

Практичная позиция: не делать резкий rewrite прямо сейчас, но начать проектировать PostgreSQL backend как exit path. SpacetimeDB можно использовать для gameplay iteration, пока paid user base мал и есть понятный rollback. Балансы, платежи и админские корректировки не должны долго оставаться в системе, которую мы сами пока плохо умеем восстанавливать и инспектировать.

## Текущий контекст проекта

Сейчас активный multiplayer path выглядит так:

- `apps/tma` подключается к SpacetimeDB через `apps/tma/src/services/gameProvider/spacetimeProvider.ts`.
- Frontend не решает исход раундов локально, а вызывает reducers и читает subscribed rows.
- SpacetimeDB module в `apps/spacetime/spacetimedb/src/index.ts` хранит accounts, players, queue, matches, round results, game events, payment ledger и admin audit.
- `apps/payments` принимает Telegram Stars flow и либо вызывает trusted SpacetimeDB reducers, либо использует SQL fallback.
- `docker-compose.selfhost.yml` поднимает `spacetimedb`, `payments`, `tma`, `edge` и опциональный tunnel.
- `docs/self-hosting.md` прямо говорит, что wallet history требует trusted payment-ledger path; fallback режим является временным и менее полноценным.

Это важно: мы сравниваем не "базу с базой", а два backend-подхода:

1. SpacetimeDB как database + realtime sync + application logic inside reducers.
2. PostgreSQL как system of record + отдельный backend для API, WebSocket, matchmaking, timers и payment workflows.

## Критерии оценки

- Контроль балансов и платежного ledger.
- Восстановление после ошибки оператора, бага, падения диска или неудачного deploy.
- Понятность отладки для маленькой команды.
- Скорость разработки gameplay mechanics.
- Реальное время и reconnect behavior в TMA.
- Безопасность публичного endpoint.
- Стоимость миграции и риск появления новых игровых багов.
- Долгосрочная независимость от нишевой технологии.

## Что SpacetimeDB дает проекту

SpacetimeDB хорошо совпадает с текущим gameplay loop. Reducers являются единственным штатным путем мутации таблиц, а каждая reducer invocation выполняется транзакционно. Для игры это удобно: `join_queue`, `commit_move`, `reveal_move`, `next_round`, `forfeit_match` и scheduler живут рядом с состоянием матча.

Realtime subscriptions тоже являются сильной стороной. Клиент получает начальные rows, затем incremental updates, а SDK держит локальный cache. В нашем приложении это уже встроено в provider boundary: экраны не читают SDK напрямую, а получают события provider contract. Поэтому SpacetimeDB позволяет быстро чинить gameplay without rebuilding a separate socket server.

Еще один плюс: текущий код уже написан. Переезд с SpacetimeDB на PostgreSQL сейчас будет не "заменить storage", а переписать backend surface: matchmaking, round settlement, timers, subscriptions, reconnect, pending reveal, old match filtering, balance updates, game events, smoke tests.

## Почему SpacetimeDB self-host надо рационально сомневаться

### 1. Self-host не равен Maincloud

Maincloud официально берет на себя infrastructure, scaling, replication и backups. Self-host guide, напротив, описывает запуск одного SpacetimeDB service за Nginx/systemd. Для нашего single-host Docker Compose это означает: все production обязанности переходят к нам.

У нас пока есть минимальный cold backup Docker volume. Этого недостаточно, если paid balances становятся реальным обязательством перед пользователями. Нужны регулярные restore drills, RPO/RTO, monitoring, alerts, storage checks и документированная процедура recovery.

### 2. Recovery story слабее, чем у PostgreSQL

SpacetimeDB документирует durability через commit log и replay. Это полезно, но операторский контур вокруг point-in-time recovery, архивирования, standby, failover и managed tooling у PostgreSQL значительно взрослее.

PostgreSQL имеет понятную WAL/PITR модель: base backup + WAL archive позволяют восстановить состояние на выбранный момент после backup. Для платных балансов это критично: если баг списал баланс или оператор сделал плохой update, нам нужен не только "вернуть контейнер", а контролируемый recovery path.

### 3. Payment token/bootstrap остается острым местом

Текущий PRD уже выделяет `PAYMENTS_SPACETIME_TOKEN` как отдельную задачу. Это не второстепенная деталь. Если trusted token не воспроизводим, не ротируется и не проверяется тестами, платежи работают либо через хрупкий fallback, либо через ручную операционную магию.

Для PostgreSQL payment service может быть обычным privileged backend с database credentials, migrations, constraints и audit tables. Это не делает систему автоматически безопасной, но делает модель привычной и проверяемой.

### 4. SQL и администрирование выглядят менее зрелыми

Мы уже используем `spacetime sql` для диагностики и ручных правок. Локальный CLI помечает SQL command как unstable. Это не блокер для playtest, но плохой фундамент для регулярных финансовых операций, аудита и поддержки пользователей.

В PostgreSQL админский контур банален: SQL, constraints, migrations, views, indexes, backups, read replicas, audit triggers, psql, pg_dump, pgBackRest, Grafana exporters, managed hosting. Банальность тут плюс.

### 5. Public endpoint требует строгой дисциплины

Official self-host docs прямо предупреждают, что proxy configuration не должна открывать весь SpacetimeDB host наружу. Public clients все равно должны иметь возможность создать identity, подписаться и вызвать reducers через WebSocket, поэтому безопасность оказывается в reducers and reverse proxy rules.

Это приемлемо для игры, но платежные reducers и admin-facing capabilities должны быть изолированы сильнее. Любая ошибка в claims validation, public table exposure или proxy route может иметь прямой финансовый эффект.

### 6. Нишевая технология увеличивает bus factor

SpacetimeDB быстрее для нашей текущей модели, но людей, tooling, hosted alternatives, готовых runbooks и production war stories меньше, чем у PostgreSQL. Когда баг появляется в SpacetimeDB subscription, generated bindings, reducer runtime или self-host storage, команда имеет меньше внешних опор.

Отдельный сигнал: repo уже использует CLI/SDK 2.2.0, а публичные docs, которые сейчас доступны, отображают версию 2.0.0. Это не доказательство проблемы, но это пример операционного трения: точная версия runtime, SDK и docs должна быть зафиксирована и проверяема.

## Что PostgreSQL дает как альтернатива

### 1. Лучший system of record для денег

PostgreSQL проще защищать как ledger:

- `payment_ledger` с unique constraints по Telegram charge ID.
- `account_balance_events` как append-only source.
- `admin_audit_event` с foreign keys и immutable rows.
- транзакции для "записать платеж + изменить баланс + audit".
- views для wallet history и support console.
- point-in-time recovery для ошибочных операций.

Это не только вопрос надежности. Это вопрос доверия к процессу: когда пользователь говорит "я оплатил и не получил EML", оператор должен быстро получить понятный ответ из ledger.

### 2. Operations дешевле ментально

PostgreSQL имеет стандартные ответы на вопросы:

- как сделать backup;
- как проверить restore;
- как поднять read replica;
- как мигрировать schema;
- как посмотреть slow queries;
- как ограничить доступ;
- как дать support read-only доступ;
- как экспортировать данные.

SpacetimeDB self-host может это частично закрывать, но нам придется строить больше процесса самим.

### 3. Миграция на managed provider проще

Если single-host перестанет хватать, PostgreSQL можно перенести в managed Postgres почти у любого cloud provider. SpacetimeDB self-host можно тоже переносить, но выбор провайдеров и готовых operational contracts уже.

### 4. Лучше подходит для analytics/admin

Admin interface со статистикой активности, платежами, balances, refunds, entry fees, Season Points, матчами и спорными случаями естественнее строить поверх PostgreSQL views/queries. В SpacetimeDB это возможно, но сейчас у нас уже видны обходные пути: backend SQL fallback, JSONL audit fallback, ручные SQL checks.

## Что PostgreSQL не дает бесплатно

### 1. Realtime subscriptions придется строить самим

PostgreSQL не заменит SpacetimeDB subscriptions. `LISTEN/NOTIFY` можно использовать как сигнал, но это не durable event queue, payload ограничен, а delivery завязана на open listener sessions. Для игровой синхронизации нужен backend, который держит WebSocket clients, читает authoritative state, рассылает updates и умеет reconnect.

Для production-варианта нужны:

- WebSocket gateway;
- server-side session model;
- subscriptions per room/match/account;
- reconnect and resync;
- idempotent commands;
- timers/scheduler;
- queue cleanup;
- event log;
- tests for race conditions.

### 2. Game reducer logic надо перенести

Текущие reducers не являются SQL procedures. Логику придется вынести в TypeScript backend service или stored procedures. Лучше держать game rules in `packages/shared`, а backend делать thin orchestration layer. Но orchestration все равно большой кусок работы.

### 3. Больше компонентов

Вероятная PostgreSQL architecture:

- PostgreSQL;
- Node backend API/WebSocket;
- payments service или объединенный backend;
- scheduler worker;
- static TMA;
- reverse proxy;
- optional Redis for ephemeral pub/sub/locks/queues.

Это привычнее, но не проще по количеству процессов.

### 4. Риск нового класса gameplay bugs

Недавний баг со счетом был в server-authoritative settlement. При миграции таких багов станет больше, потому что мы перепишем весь settlement path. Поэтому "мигрировать на PostgreSQL" не должно означать "быстро переписать вечером". Нужен staged migration с shadow tests.

## Сравнительная таблица

| Критерий | SpacetimeDB self-host | PostgreSQL + backend |
| --- | --- | --- |
| Скорость продолжения текущего playtest | Высокая: код уже написан | Низкая: нужен backend rewrite |
| Realtime state sync | Встроен через subscriptions/cache | Нужно строить WebSocket layer |
| Gameplay authority | Уже в reducers | Нужно перенести logic/service |
| Платежный ledger | Возможен, но token/bootstrap и ops спорные | Естественная модель |
| Backup/recovery | Нужны свои drills вокруг volume/commit log | WAL, PITR, mature tooling |
| Админка и аналитика | Работает, но менее удобно | Сильная сторона |
| Public endpoint security | Требует аккуратного proxy + reducer auth | Backend hides DB from clients |
| Vendor/technology risk | Выше: niche/source-available/runtime-specific | Ниже: mature/open ecosystem |
| Operational familiarity | Ниже | Выше |
| Стоимость миграции сейчас | Нулевая/низкая | Высокая |
| Долгосрочная ремонтопригодность | Не доказана для нашей команды | Более предсказуема |

## Архитектурные варианты

### Вариант A: оставить SpacetimeDB self-host как есть

Подходит для короткого mechanics-test.

Условия, без которых это опасно:

- backup/restore проверен на fresh host;
- publish path не чистит данные;
- public proxy не открывает operator SQL/admin routes;
- `PAYMENTS_SPACETIME_TOKEN` воспроизводим и ротируем;
- payments fallback не используется как permanent mode;
- есть monitoring на SpacetimeDB, payments, edge и disk usage;
- есть ручной runbook для "пользователь оплатил, баланс не обновился".

Риск: мы продолжаем инвестировать в нишевой runtime и можем снова упереться в operational gaps, когда пользователей станет больше.

### Вариант B: PostgreSQL как единый authoritative backend

Подходит для production-ориентированного paid app.

Суть:

- PostgreSQL хранит accounts, balances, payment ledger, matches, rounds, events, admin audit.
- Backend принимает TMA commands, валидирует Telegram init data, держит WebSocket sessions.
- Game commands выполняются в DB transactions.
- Frontend provider меняется с `spacetimeProvider` на новый backend provider без переписывания screens.

Риск: большой rewrite. Его нельзя делать без parity tests against current game scenarios.

### Вариант C: hybrid, PostgreSQL для денег, SpacetimeDB для матчей

На первый взгляд это компромисс, но он опасен, если баланс нужен для оплаты entry fee внутри матча. Нельзя иметь два источника истины по балансу.

Допустимый hybrid только такой:

- PostgreSQL является единственным source of truth для paid balances и payment ledger.
- SpacetimeDB хранит только ephemeral match state или mirror state.
- Перед матчем backend резервирует или списывает entry fee в PostgreSQL.
- SpacetimeDB match settlement публикует событие, backend применяет Season Points, rating/accounting events и refund eligibility в PostgreSQL.
- Есть reconciliation job и idempotency keys.

Это сложнее, чем кажется. Для маленькой команды такой hybrid имеет смысл только как временный мост миграции, а не как постоянная архитектура.

## Рекомендация

Не надо прямо сейчас бросать SpacetimeDB и переписывать игру на PostgreSQL. Это остановит текущие gameplay fixes и почти гарантированно принесет новые race conditions.

Но также не надо считать SpacetimeDB self-host окончательным production backend для платной экономики. Сейчас это provisional runtime. Он должен пройти operational proof, иначе paid balances лучше перенести в PostgreSQL-backed backend.

Рекомендуемый порядок:

1. Закрыть минимальные self-host gaps: token bootstrap, backup/restore drill, proxy hardening, monitoring, payment runbook.
2. Создать отдельный PostgreSQL backend spike, не ломая текущую игру.
3. Спроектировать PostgreSQL schema для accounts, balance ledger, payment ledger, matches, rounds, events, admin audit.
4. Реализовать минимальный backend provider behind existing `GameplayProvider` contract.
5. Прогнать parity tests: full match, max-round settlement, draw settlement without payout pool, timeout, reconnect, payment credit, refund.
6. Решить: либо SpacetimeDB доказал себя операционно, либо PostgreSQL backend становится основным.

## Decision gates

Оставляем SpacetimeDB self-host дольше, только если выполняется все:

- restore из backup на fresh host реально проверен;
- RPO/RTO зафиксированы;
- payment reducers работают только через trusted service token;
- fallback ledger не является основным ledger;
- админские корректировки пишутся в надежный audit trail;
- есть регулярный smoke для Telegram payment credit;
- оператор может за 5 минут ответить, почему баланс пользователя такой;
- команда принимает single-host риск для текущего масштаба.

Начинаем миграцию на PostgreSQL, если выполняется любое:

- paid balances становятся существенными для пользователей;
- нужен reliable refund/audit/reporting workflow;
- повторяются случаи "баланс в базе правильный, frontend/подписка показывает другое";
- self-host SpacetimeDB требует ручных SQL/volume правок чаще, чем gameplay fixes;
- нужен PITR или standby с понятной процедурой;
- появляются внешние требования к финансовому учету.

## Предлагаемый PostgreSQL spike

Цель spike: не переписать игру, а получить доказательства стоимости миграции.

Scope на 3-5 дней:

- SQL schema для `account`, `balance_event`, `payment_ledger`, `match`, `round_result`, `game_event`.
- Один backend command path: create two-player match, commit/reveal moves, settle match.
- WebSocket subscription only for one room/match.
- Payment credit transaction with idempotent Telegram charge ID.
- Admin balance adjustment with append-only audit.
- Playwright smoke через новый provider against local backend.

Exit criteria:

- новый backend проходит сценарий "1 win + 4 draws => final score 1:0";
- balance ledger объясняет каждый balance change;
- restore from PostgreSQL backup is documented;
- оценка полного migration effort дана в issues.

## Чего не делать

- Не подключать frontend напрямую к PostgreSQL.
- Не держать paid balance одновременно в PostgreSQL и SpacetimeDB без одного явного source of truth.
- Не использовать `LISTEN/NOTIFY` как durable message queue.
- Не полагаться только на `pg_dump`, если речь идет о production paid balances.
- Не считать Docker volume backup достаточным доказательством recovery.
- Не открывать SpacetimeDB root/API routes публично шире, чем нужно TMA clients.
- Не делать миграцию без replayable сценариев матчей и платежей.

## Источники

- SpacetimeDB reducers: https://spacetimedb.com/docs/functions/reducers/
- SpacetimeDB transactions and atomicity: https://spacetimedb.com/docs/databases/transactions-atomicity/
- SpacetimeDB subscription semantics: https://spacetimedb.com/docs/clients/subscriptions/semantics/
- SpacetimeDB self-hosting guide: https://spacetimedb.com/docs/how-to/deploy/self-hosting/
- SpacetimeDB Maincloud deployment docs: https://spacetimedb.com/docs/how-to/deploy/maincloud/
- PostgreSQL continuous archiving and PITR: https://www.postgresql.org/docs/current/continuous-archiving.html
- PostgreSQL high availability overview: https://www.postgresql.org/docs/current/high-availability.html
- PostgreSQL logical replication: https://www.postgresql.org/docs/current/logical-replication.html
- PostgreSQL `NOTIFY`: https://www.postgresql.org/docs/current/sql-notify.html
