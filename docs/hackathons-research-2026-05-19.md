# Исследование активных хакатонов

Дата ревизии: 2026-05-19. В списке оставлены только события и программы, где еще можно участвовать, зарегистрироваться или подать проект. Закрытые и завершенные submission windows удалены.

## Короткий вывод

Самые сильные ближайшие варианты:

1. [Build with MeDo Hackathon](https://medo.devpost.com/) - дедлайн 2026-05-20 09:00 EDT, онлайн, $50,000. Очень срочно; идти стоит только если реально успеть собрать no-code/AI demo за сутки.
2. [Eazo.ai Global Hackathon](https://eazo-ai-hackathon.devpost.com/) - 2026-05-23/24, онлайн + SF/NYC, заявленный призовой фонд $300,000. Максимальная срочность и большой фонд, но нужно строить через Eazo Creator.
3. [Arbitrum Open House London: Online Buildathon](https://www.hackquest.io/en/hackathons/Arbitrum-Open-House-London-Online-Buildathon) - регистрация до 2026-05-25, submission до 2026-06-14, онлайн, $115,000. Лучший web3-кандидат из найденных.
4. [The Turing Test Hackathon 2026](https://www.eventbrite.com/e/the-turing-test-hackathon-2026-tickets-1988149115524) - до 2026-06-16, онлайн, $120,000. DoraHacks/Mantle, agentic AI + on-chain infrastructure.
5. [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) - дедлайн 2026-06-11, онлайн, $60,000. Хорошо ложится на agentic ops/QA/observability вокруг Elmental.
6. [UiPath AgentHack](https://uipath-agenthack.devpost.com/) - дедлайн 2026-06-29, онлайн, $50,000. Хороший фонд, но требуется UiPath execution/orchestration layer.

NEAR/Aurora update: на 2026-05-19 не найдено открытого крупного NEAR/Aurora blockchain hackathon с фондом $50k+ и коротким дедлайном. Актуальные варианты участия: IronClaw Hackathon Barcelona 2026-06-18, NEAR Protocol Rewards, NEAR Horizon, NEAR Agent Market и NEAR Intents SDK bug bounty.

## Критерии

- Срочность: дедлайн/старт в ближайшие 1-6 недель.
- Приз: высокий приоритет от $50k, средний от $10k, низкий ниже $10k.
- Доступность: онлайн или гибрид лучше офлайна.
- Fit для Elmental: AI agents, game UX, web3 consumer UX, anti-cheat, telemetry, matchmaking/ops, Telegram Mini App, on-chain/account-abstraction narrative.
- Ограничения: required vendor stack, student-only, region-only, офлайн-участие, неясный призовой фонд.

## P0: регистрироваться сейчас

| Хакатон | Срок | Призы | Формат | Почему в P0 | Риск/ограничение |
|---|---:|---:|---|---|---|
| [Build with MeDo Hackathon](https://medo.devpost.com/) | дедлайн 2026-05-20 09:00 EDT | $50,000 | Онлайн | Крупный фонд и еще открытый дедлайн | Практически нет времени; required MeDo/no-code flow |
| [Eazo.ai Hackathon](https://eazo-ai-hackathon.devpost.com/) | регистрация до 2026-05-23 PT; hacking/voting 2026-05-23/24 | $300,000 по overview; Devpost card показывает $3,000,000, это выглядит как расхождение | Онлайн + SF/NYC | Самый большой ближайший фонд, глобальный доступ, короткий спринт | Нужно использовать Eazo Creator; лучше делать отдельный прототип |
| [Arbitrum Open House London: Online Buildathon](https://www.hackquest.io/en/hackathons/Arbitrum-Open-House-London-Online-Buildathon) | регистрация до 2026-05-25; submission до 2026-06-14 | $115,000 | Онлайн | Крупный web3 фонд, Solidity/Rust, хороший fit для walletless/game/consumer UX | Нужно деплоить на Arbitrum chain; follow-on IRL Founder House может требовать поездку |

## P1: готовить сабмишен в ближайшие 1-3 недели

| Хакатон | Срок | Призы | Формат | Fit | Что строить |
|---|---:|---:|---|---|---|
| [Google Cloud Rapid Agent Hackathon](https://rapid-agent.devpost.com/) | дедлайн 2026-06-11 14:00 PDT | $60,000 | Онлайн | AI agents, MCP, ops, data | Agent для анализа `game_event`, stuck queues, match anomalies, replay timeline; использовать Gemini/Google Cloud Agent Builder + partner MCP |
| [The Turing Test Hackathon 2026](https://www.eventbrite.com/e/the-turing-test-hackathon-2026-tickets-1988149115524) | до 2026-06-16 | $120,000 | Онлайн | Mantle, DoraHacks, agentic AI + on-chain infrastructure | Agentic Tournament Referee или secure autonomous game/tournament agent |
| [Splunk Agentic Ops Hackathon](https://splunk.devpost.com/) | submissions 2026-05-18 - 2026-06-15 | $20,000 | Онлайн | Observability/security/platform | Elmental Ops Copilot: ingest trace/game_event logs, detect regressions, produce incident report |
| [FIND EVIL!](https://findevil.devpost.com/) | дедлайн 2026-06-15 23:45 EDT | $22,000 | Онлайн | Security + AI agents | AI defender/incident-response workflow around game infra |
| [MetaMask Smart Accounts Kit x 1Shot API Dev Cook Off](https://1shotapi.com/blog/metamask-1shot-api-dev-cook-off) | submission до 2026-06-15 | $11,000+ | Онлайн | Smart accounts, autonomous agents, wallet permissions | Agentic on-chain UX: delegated tournament actions, account-safe game operations |
| [Somnia Agentathon](https://www.encodeclub.com/programmes/agentathon) | 2026-05-20 - 2026-06-11 | $5,000 | Онлайн | Agentic L1, real-time dapps | Autonomous tournament/referee agent, replay coach, agent-to-agent challenge flow |
| [Codorra](https://codorra1.devpost.com/) | 2026-05-29 - 2026-05-31 | Rs 1,199,997 cash | Онлайн / location TBD | AI, cybersecurity, web/mobile | Anti-cheat, player safety, automated threat detection; team of 2-4 required |

## P2: позже или с сильной спецификой

| Хакатон | Срок | Призы | Формат | Комментарий |
|---|---:|---:|---|---|
| [UiPath AgentHack](https://uipath-agenthack.devpost.com/) | дедлайн 2026-06-29 23:45 PDT | $50,000 | Онлайн | Enterprise agent orchestration. Подходит для ops automation, но требует UiPath Platform |
| [UXmaxx Hackathon](https://www.encodeclub.com/programmes/uxmaxx-hackathon) | старт 2026-06-22, 6 недель | $15,000+ | Онлайн | Хороший fit для walletless crypto UX, account abstraction, Openfort, Arbitrum, gaming |
| [Build on Canton Hackathon](https://www.encodeclub.com/programmes/canton-hackathon) | старт 2026-06-15, 4 недели | $7,000 | Онлайн | Сильнее для institutional finance/RWA, но есть agentic commerce + privacy angle |
| [CopernicusLAC Panama Hackathon 2026](https://taikai.network/en/copernicuslac-panama/hackathons/seguridad-alimentaria-2026) | регистрация до 2026-05-20/21; event 2026-05-21 - 2026-06-11 | $50,000 по TAIKAI listing | Онлайн | Участие 18+ открыто при соблюдении team criteria; тема food security/space data далеко от Elmental |
| [Ctrl/Shift 2026 Hackathon](https://www.ctrlshift.events/) | 2026-06-13 - 2026-06-15 | prizes/grants not published | Naples, Italy | AI + blockchain + quantum; участвовать имеет смысл только при готовности ехать в Неаполь |
| [ETHGlobal New York 2026](https://ethglobal.com/) | 2026-06-12 - 2026-06-14 | prizes не опубликованы на проверенной странице | NYC / ETHGlobal | Подаваться только если возможен офлайн; ценно для web3 networking |
| [ETHGlobal Lisbon 2026](https://ethglobal.com/) | 2026-07-24 - 2026-07-26 | prizes не опубликованы на проверенной странице | Lisbon / ETHGlobal | Хороший июльский target, мониторить prizes page |

## NEAR/Aurora active

| Возможность | Срок/статус | Призы/финансы | Формат | Приоритет | Комментарий |
|---|---:|---:|---|---|---|
| [NEAR Legion Barcelona: IronClaw Hackathon](https://luma.com/h2az9d83) | 2026-06-18, 18:00-22:00 GMT+2 | sponsor prizes/details TBD | Офлайн, 42 Barcelona | P2/P3 | Открыт для всех; тема privacy/data security for AI agents using IronClaw. Fit для secure game ops/referee agent, но нужен офлайн Barcelona |
| [NEAR Protocol Rewards](https://www.nearprotocolrewards.com/) | ongoing, next cohort application | up to $10,000/month; page также показывает $200,000+ total rewards | Cohort/rewards | P1 для NEAR-версии проекта | Не хакатон, но финансово лучше многих малых хакатонов. Focus: agentic protocols, distributed AI, native coordination tools on NEAR |
| [NEAR Horizon / Founder Hub](https://www.near.org/founder-hub) | ongoing applications | funding/mentorship/perks; builder perks $500k+ resources | Accelerator/founder support | P1/P2 | Для серьезной NEAR-версии Elmental: AI + blockchain product, Intents, Chain Abstraction, Horizon support |
| [NEAR Intents: SDK Bug Bounty](https://hackenproof.com/programs/near-intents-sdk) | active now | $100-$20,000 | Bug bounty | P2 для security work | Не хакатон. Scope: TypeScript SDK, cross-chain withdrawals, intent signing, route detection, replay attacks, fee calculation |
| [NEAR Agent Market](https://market.near.ai/) | active alpha | job/agent market, not fixed hackathon prize | Agent marketplace | P2/P3 | Можно выложить `Elmental Match Auditor` или `SpacetimeDB PvP Trace Summarizer` как агент/сервис и проверить спрос |

## Project angles для Elmental

### 1. Elmental Ops Copilot

Агент/дашборд, который читает trace logs и `game_event`, находит stuck queue, multiple active matches, stale settled updates, subscription delays, generates incident timeline and suggested fix.

Подходит для: Google Cloud Rapid Agent, Splunk Agentic Ops, FIND EVIL, UiPath AgentHack, NEAR Protocol Rewards.

### 2. Walletless PvP Mini Game / Consumer Crypto UX

Показать Elmental как мини-игру с frictionless onboarding, account abstraction, invisible wallet, optional on-chain tournament receipts, no gambling framing.

Подходит для: Arbitrum Open House London, UXmaxx, MetaMask/1Shot Dev Cook Off, ETHGlobal, NEAR Intents.

### 3. Agentic Tournament Referee

Autonomous agent observes matches, validates commit/reveal timing, detects suspicious behavior, posts summaries, can organize tournaments or resolve disputes.

Подходит для: Turing Test Hackathon, Somnia Agentathon, Google Rapid Agent, NEAR IronClaw/Protocol Rewards.

### 4. AI Coach / Replay Analyst

Отдельный web/no-code app that ingests match rounds and explains move/energy decisions, suggests strategy, turns gameplay into shareable insights.

Подходит для: Eazo.ai, Build with MeDo, Codorra, Google Rapid Agent.

## Практический план

1. Сегодня: зарегистрироваться в Build with MeDo, Eazo, Arbitrum London, Turing Test, Google Rapid Agent.
2. Если есть 1 день: делать MeDo/Eazo отдельным маленьким прототипом, не переписывать основной Elmental ради no-code хакатона.
3. Если есть 1-2 недели: основной target - Google Rapid Agent или Turing Test; использовать текущий repo и публичную механику как доказательство real product.
4. Если web3 приоритет выше AI: Arbitrum London сейчас самый сильный, затем MetaMask/1Shot, UXmaxx и ETHGlobal.
5. Если хочется именно NEAR/Aurora: собрать NEAR/IronClaw demo + подать в Protocol Rewards/Horizon, затем мониторить NEAR Legion, Horizon и Agent Market.
6. Для выбранного target сразу завести отдельный `docs/hackathon-submission-<name>.md` с requirements, judging criteria, demo script и ссылками.

## Источники

- Build with MeDo Devpost: https://medo.devpost.com/
- Eazo.ai Devpost: https://eazo-ai-hackathon.devpost.com/
- Arbitrum Open House London HackQuest: https://www.hackquest.io/en/hackathons/Arbitrum-Open-House-London-Online-Buildathon
- DoraHacks/Mantle Turing Test Eventbrite: https://www.eventbrite.com/e/the-turing-test-hackathon-2026-tickets-1988149115524
- Google Cloud Rapid Agent Devpost: https://rapid-agent.devpost.com/
- Splunk Agentic Ops Devpost: https://splunk.devpost.com/
- FIND EVIL Devpost: https://findevil.devpost.com/
- MetaMask x 1Shot Dev Cook Off: https://1shotapi.com/blog/metamask-1shot-api-dev-cook-off
- Somnia Agentathon: https://www.encodeclub.com/programmes/agentathon
- Codorra Devpost: https://codorra1.devpost.com/
- UiPath AgentHack Devpost: https://uipath-agenthack.devpost.com/
- UXmaxx Hackathon: https://www.encodeclub.com/programmes/uxmaxx-hackathon
- Build on Canton Hackathon: https://www.encodeclub.com/programmes/canton-hackathon
- CopernicusLAC Panama Hackathon: https://taikai.network/en/copernicuslac-panama/hackathons/seguridad-alimentaria-2026
- CopernicusLAC official announcement: https://www.copernicuslac-panama.eu/news/copernicus-lac-hackathon-2026-innovation-in-sustainable-agriculture-using-earth-observation-data/
- Ctrl/Shift 2026 Hackathon: https://www.ctrlshift.events/
- ETHGlobal events: https://ethglobal.com/
- NEAR Legion Barcelona IronClaw Hackathon: https://luma.com/h2az9d83
- NEAR Founder Hub: https://www.near.org/founder-hub
- NEAR Protocol Rewards: https://www.nearprotocolrewards.com/
- NEAR Horizon: https://www.hzn.xyz/
- NEAR Agent Market: https://market.near.ai/
- NEAR Intents docs: https://docs.near-intents.org/
- NEAR Intents SDK HackenProof bounty: https://hackenproof.com/programs/near-intents-sdk
- Aurora official site: https://aurora.dev/
- Aurora Virtual Chains docs: https://doc.aurora.dev/aurora-cloud/welcome/about-virtual-chains/
