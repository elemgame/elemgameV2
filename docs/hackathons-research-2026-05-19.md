# Исследование хакатонов на ближайший срок

Дата проверки: 2026-05-19. Приоритет: короткий срок, большой призовой фонд, онлайн/гибридный доступ, возможность использовать текущий стек Elmental V2 или быстро собрать отдельный прототип.

## Короткий вывод

Самые сильные ближайшие варианты:

1. [Eazo.ai Global Hackathon](https://eazo-ai-hackathon.devpost.com/) - 23-24 мая, онлайн + SF/NYC, заявленный призовой фонд $300,000. Максимальная срочность и большой фонд, но нужно строить через Eazo Creator.
2. [Arbitrum Open House London: Online Buildathon](https://www.hackquest.io/hackathons/Arbitrum-Open-House-London-Online-Buildathon) - регистрация еще около 6 дней на момент проверки, онлайн, $115,000. Лучший web3-кандидат из найденных, если регистрация еще открыта.
3. [The Turing Test Hackathon 2026](https://www.eventbrite.com/e/the-turing-test-hackathon-2026-tickets-1988149115524) - 1 мая - 16 июня, онлайн, $120,000. DoraHacks/Mantle, agentic AI + on-chain infrastructure.
4. [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) - дедлайн 11 июня, онлайн, $60,000. Хорошо ложится на agentic ops/QA/observability вокруг Elmental.
5. [UiPath AgentHack](https://uipath-agenthack.devpost.com/) - дедлайн 29 июня PDT / 30 июня EDT, онлайн, $50,000. Меньше срочность, но нормальный фонд и enterprise-agent тема.
6. [Build with MeDo Hackathon](https://medo.devpost.com/) - дедлайн 20 мая 09:00 EDT, онлайн, $50,000. Очень срочно; идти стоит только если реально успеть за несколько часов/сутки и принять no-code ограничение.

## Критерии оценки

- Срочность: дедлайн/старт в ближайшие 1-6 недель.
- Приз: высокий приоритет от $50k, средний от $10k, низкий ниже $10k.
- Доступность: онлайн или гибрид лучше офлайна.
- Fit для Elmental: AI agents, game UX, web3 consumer UX, anti-cheat, telemetry, matchmaking/ops, Telegram mini app, on-chain/account-abstraction narrative.
- Ограничения: student-only, region-only, required vendor stack, already in voting, unclear prize, уже завершено.

## P0: проверить и регистрироваться сейчас

| Хакатон | Срок | Призы | Формат | Почему в P0 | Риск/ограничение |
|---|---:|---:|---|---|---|
| [Eazo.ai Hackathon](https://eazo-ai-hackathon.devpost.com/) | 23-24 мая; регистрация до 23 мая PT; submissions 23 мая 12:00-23:00 EDT | $300,000 по описанию; Devpost card показывает $3,000,000, это выглядит как расхождение | Онлайн + SF/NYC | Самый большой ближайший фонд, глобальный доступ, короткий спринт | Нужно использовать Eazo Creator; проект может быть отдельным прототипом, не обязательно основной repo |
| [Arbitrum Open House London: Online Buildathon](https://www.hackquest.io/hackathons/Arbitrum-Open-House-London-Online-Buildathon) | регистрация около 6 дней left на 2026-05-19 | $115,000 | Онлайн | Крупный web3 фонд, Solidity/Rust, хороший fit для walletless/game/consumer UX | Нужно немедленно открыть детали и подтвердить submission window |
| [The Turing Test Hackathon 2026](https://www.eventbrite.com/e/the-turing-test-hackathon-2026-tickets-1988149115524) | 1 мая - 16 июня | $120,000 | Онлайн | Agentic AI + on-chain на Mantle; DoraHacks/HackQuest ecosystem | Основная DoraHacks-страница открылась через human verification, детали лучше перепроверить после логина |
| [Build with MeDo Hackathon](https://medo.devpost.com/) | дедлайн 20 мая 09:00 EDT | $50,000+ | Онлайн | Очень близкий дедлайн и крупный фонд; есть Lifestyle & Game track | Слишком мало времени; required MeDo/no-code flow |

## P1: готовить сабмишен в ближайшие 1-3 недели

| Хакатон | Срок | Призы | Формат | Fit | Что строить |
|---|---:|---:|---|---|---|
| [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) | дедлайн 11 июня 14:00 PDT | $60,000 | Онлайн | AI agents, MCP, ops, data | Agent для анализа `game_event`, stuck queues, match anomalies, replay timeline; использовать Google Cloud Agent Builder + partner MCP |
| [Splunk Agentic Ops Hackathon](https://splunk.devpost.com/) | 18 мая - 15 июня | $20,000 | Онлайн | Observability/security/platform | Elmental Ops Copilot: ingest trace/game_event logs, detect regressions, produce incident report |
| [FIND EVIL!](https://findevil.devpost.com/) | дедлайн 15 июня 23:45 EDT | $22,000 | Онлайн | Security + AI agents | Не прямой game fit, но можно сделать AI defender/incident-response workflow around game infra |
| [Somnia Agentathon](https://www.encodeclub.com/programmes/agentathon) | старт 20 мая, 4 недели | $5,000 | Онлайн | Agentic L1, real-time dapps | Autonomous tournament/referee agent, agent-powered replay coach, agent-to-agent challenge flow |
| [Codorra](https://codorra1.devpost.com/) | 29-31 мая | Rs 1,199,997 cash | Онлайн/Location TBD | AI, cybersecurity, web/mobile | Anti-cheat, player safety, threat detection, automated test triage |

## P2: хороший фонд, но дальше по сроку или с сильной спецификой

| Хакатон | Срок | Призы | Формат | Комментарий |
|---|---:|---:|---|---|
| [UiPath AgentHack](https://uipath-agenthack.devpost.com/) | дедлайн 29 июня PDT / 30 июня EDT | $50,000 | Онлайн | Enterprise agent orchestration. Подходит для ops automation, но требует UiPath as execution/orchestration layer |
| [UXmaxx Hackathon](https://www.encodeclub.com/programmes/uxmaxx-hackathon) | старт 22 июня, 6 недель | $15,000+ | Онлайн | Очень хороший fit для walletless crypto UX, account abstraction, Openfort, Arbitrum, gaming |
| [Build on Canton Hackathon](https://www.encodeclub.com/programmes/canton-hackathon) | старт 15 июня, 4 недели | $7,000 | Онлайн | Сильнее для institutional finance/RWA, слабее для Elmental, но есть agentic commerce + privacy angle |
| [MetaMask Smart Accounts Kit x 1Shot API x Venice AI Dev Cook Off](https://www.hackquest.io/hackathons/MetaMask-Smart-Accounts-Kit-x-1Shot-API-x-Venice-AI-Dev-Cook-Off) | регистрация около месяца left | $14,000 | Онлайн | Agentic on-chain UX, smart accounts. Средний фонд, неплохой fit |
| [CopernicusLAC Panama Hackathon 2026](https://taikai.network/hackathons) | 23 days left на 2026-05-19 | $50,000 | Вероятно гибрид/региональный | Большой фонд, но тема food security/space data далеко от Elmental |
| [Ctrl Shift Hackathon 2026](https://taikai.network/hackathons) | 27 days left на 2026-05-19 | $15,000 | TAIKAI | AI + blockchain + DeFi, возможно релевантно, нужно открыть детали |

## Watchlist: крупные/релевантные, но не immediate submission

| Источник | Событие | Срок/статус | Призы | Вывод |
|---|---|---:|---:|---|
| HackQuest/Buidlbox | [0G APAC Hackathon](https://www.hackquest.io/hackathons/0G-APAC-Hackathon) | Voting, 10 days left | $150,000 | Крупный фонд, но статус voting означает, что новый билд может быть уже невозможен |
| ETHGlobal | [ETHGlobal New York 2026](https://ethglobal.com/) | 12-14 июня, NYC | не опубликовано на проверенной странице | Подать заявку, если возможен офлайн. ETHGlobal обычно важен для web3 networking |
| ETHGlobal | [ETHGlobal Lisbon 2026](https://ethglobal.com/) | 24-26 июля, Lisbon | не опубликовано на проверенной странице | Хороший июльский target, мониторить prizes page |
| Encode | [Rise of the Builder: Xero App & Agent Hackathon](https://www.encodeclub.com/programmes) | 4 июля, 2 дня, in-person | не найдено в списке | Вероятно полезно для agent/app angle, но офлайн |
| HackQuest/Buidlbox | Arbitrum Open House Dubai | старт через 5 месяцев | $30,000 | Не короткий срок, оставить в календаре |
| TAIKAI | CASSINI Space for Water, EUDIS Defence Spring, Hackanation | часть уже finished/ending | EUR 9k-11.5k / $6k | Скорее мониторинг и networking, не главный призовой target |

## Проверка исходного списка источников

| Источник пользователя | Что найдено | Решение |
|---|---|---|
| [Devpost Blockchain](https://devpost.com/c/blockchain) | На странице текущих online blockchain был CodeStorm с non-monetary prizes и дедлайном 28 мая; последние денежные blockchain events уже прошли | Не приоритет. Для денег лучше Devpost AI/open challenge pages |
| [DoraHacks](https://dorahacks.io/hackathon) | Прямая страница одного события открылась через human verification. Через Eventbrite найден DoraHacks/Mantle Turing Test на $120k | Использовать, но подтверждать после логина на DoraHacks |
| [Devfolio](https://devfolio.co/hackathons) | SCBC Hackathon 2026: $30k, online, но runs Apr 13-20 and ended; участие было для SCBC attendees | На момент 2026-05-19 не актуально |
| [DOU calendar](https://dou.ua/calendar/tags/%D1%85%D0%B0%D0%BA%D0%B0%D1%82%D0%BE%D0%BD/) | 12-14 июня Vinnytsia AI/defense/innovation хакатон; 13-14 июня Kyiv KSE Game Jam; оба бесплатные, призы на странице не указаны | Useful for Ukraine networking/game jam, не для большого призового фонда |
| [Buidlbox](https://app.buidlbox.io/) | App сообщает, что BuidlBox теперь часть HackQuest | Смотреть [HackQuest hackathons](https://www.hackquest.io/hackathons): там Arbitrum London $115k, 0G APAC $150k, MetaMask/1Shot/Venice $14k |
| [Encode programmes](https://www.encode.club/programmes) | Активные онлайн-хакатоны: Somnia Agentathon, Build on Canton, UXmaxx, Mezo, Kite AI | UXmaxx/Somnia/Canton стоит держать; призы меньше, но сильный web3/AI fit |
| [ETHGlobal hackathons](https://ethglobal.com/events/hackathons) | Official home показывает New York 12-14 июня и Lisbon 24-26 июля | Подать/мониторить; призы для New York/Lisbon не были опубликованы на проверенной странице |
| [TAIKAI](https://taikai.network/hackathons) | Active/nearby: Ctrl Shift $15k, CopernicusLAC $50k; много EUDIS/CASSINI уже finished/ending | Не первый выбор, но Ctrl Shift и CopernicusLAC стоит открыть отдельно при наличии времени |

## Рекомендуемые project angles для Elmental

### 1. Elmental Ops Copilot

Цель: агент/дашборд, который читает trace logs и `game_event`, находит stuck queue, multiple active matches, stale settled updates, subscription delays, generates incident timeline and suggested fix.

Подходит для: Google Cloud Rapid Agent, Splunk Agentic Ops, FIND EVIL, UiPath AgentHack.

Почему сильнее обычного demo: это реальная pain point текущего public mechanics-testing instance, есть серверные события, матчи, очереди, таймауты и воспроизводимые smoke tests.

### 2. Walletless PvP Mini Game / Consumer Crypto UX

Цель: показать Elmental как мини-игру с frictionless onboarding, account abstraction, invisible wallet, optional on-chain tournament receipts, no gambling framing.

Подходит для: Arbitrum Open House London, UXmaxx, MetaMask Smart Accounts Dev Cook Off, ETHGlobal.

Осторожно: не позиционировать как betting/gambling. Упор на skill-based PvP prototype, account abstraction, UX, identity, tournament proofs.

### 3. Agentic Tournament Referee

Цель: autonomous agent observes matches, validates commit/reveal timing, detects suspicious behavior, posts summaries, can organize tournaments or resolve disputes.

Подходит для: Turing Test Hackathon, Somnia Agentathon, Google Rapid Agent, 0G/APAC if submissions still possible.

### 4. AI Coach / Replay Analyst

Цель: отдельный web/no-code app that ingests match rounds and explains move/energy decisions, suggests strategy, turns gameplay into shareable insights.

Подходит для: Eazo.ai, Build with MeDo, Codorra, Google Rapid Agent.

## Практический план

1. Сегодня: открыть registration/details для Eazo, Arbitrum London, Turing Test, Google Rapid Agent. Зарегистрировать команду/аккаунты, пока дедлайны не закрылись.
2. Если есть 1 день: делать Eazo/MeDo отдельным маленьким прототипом. Не пытаться переписывать основной Elmental ради no-code хакатона.
3. Если есть 1-2 недели: основной target - Google Rapid Agent или Turing Test; использовать текущий repo и публичную механику как доказательство real product.
4. Если web3 приоритет выше AI: Arbitrum London сейчас самый сильный, затем UXmaxx в июне и ETHGlobal New York/Lisbon как networking/major ecosystem path.
5. Для каждого target сразу завести отдельный `docs/hackathon-submission-<name>.md` с requirements, judging criteria, demo script и ссылками.

## Источники

- Devpost Blockchain: https://devpost.com/c/blockchain
- Devpost AI listing: https://devpost.com/c/artificial-intelligence
- Eazo.ai Devpost: https://eazo-ai-hackathon.devpost.com/
- Eazo.ai schedule: https://eazo-ai-hackathon.devpost.com/details/dates
- Build with MeDo Devpost: https://medo.devpost.com/
- Google Cloud Rapid Agent Devpost: https://rapid-agent.devpost.com/
- Splunk Agentic Ops Devpost: https://splunk.devpost.com/
- FIND EVIL Devpost: https://findevil.devpost.com/
- UiPath AgentHack Devpost: https://uipath-agenthack.devpost.com/
- USAII Global AI Hackathon Devpost: https://usaii-global-ai-hackathon-2026.devpost.com/
- LaunchHacks V Devpost: https://launchhacks-v.devpost.com/
- Byte2Beat Devpost: https://byte-2-beat.devpost.com/
- Codorra Devpost: https://codorra1.devpost.com/
- DoraHacks/Mantle Turing Test Eventbrite: https://www.eventbrite.com/e/the-turing-test-hackathon-2026-tickets-1988149115524
- DoraHacks Turing Test detail URL from Eventbrite: https://dorahacks.io/hackathon/mantleturingtesthackathon2026/detail
- Devfolio SCBC: https://scbc-hackathon.devfolio.co/
- DOU hackathon tag: https://dou.ua/calendar/tags/%D1%85%D0%B0%D0%BA%D0%B0%D1%82%D0%BE%D0%BD/
- Buidlbox app notice: https://app.buidlbox.io/
- HackQuest hackathons: https://www.hackquest.io/hackathons
- Encode programmes: https://www.encodeclub.com/programmes
- Somnia Agentathon: https://www.encodeclub.com/programmes/agentathon
- Build on Canton Hackathon: https://www.encodeclub.com/programmes/canton-hackathon
- UXmaxx Hackathon: https://www.encodeclub.com/programmes/uxmaxx-hackathon
- ETHGlobal home/events: https://ethglobal.com/
- ETHGlobal Cannes 2026 example prize page: https://ethglobal.com/events/cannes2026
- TAIKAI hackathons: https://taikai.network/hackathons
