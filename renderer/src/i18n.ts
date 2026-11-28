import { MORE_EN, MORE } from './i18n-more.js';
import { SECURITY_EN, SECURITY } from './i18n-security.js';
import { APP_EN, APP } from './i18n-app.js';

const en = {
  ...MORE_EN,
  ...SECURITY_EN,
  ...APP_EN,
  'nav.audit': 'Audit', 'nav.history': 'History', 'nav.settings': 'Settings',
  'hero.eyebrow': 'Sightline', 'hero.title': 'Every detail. Audited.',
  'hero.lead': 'SEO, hreflang, links, performance, Cloudflare, iPhone and memory leaks — in one place.',
  'hero.placeholder': 'Enter a website, e.g. apple.com', 'hero.button': 'Audit',
  'modules.title': 'Include',
  'cat.seo': 'SEO', 'cat.hreflang': 'Hreflang', 'cat.links': 'Links', 'cat.website': 'Website health',
  'cat.performance': 'Performance', 'cat.cloudflare': 'Cloudflare & DNS', 'cat.mobile': 'iPhone & iPad', 'cat.memory': 'Memory leaks',
  'run.title': 'Auditing', 'run.cancel': 'Cancel',
  'report.overall': 'Overall score', 'report.exportPdf': 'Export PDF', 'report.exportHtml': 'HTML', 'report.exportJson': 'JSON',
  'report.newAudit': 'New audit', 'report.passed': 'passed', 'report.warnings': 'warnings', 'report.failed': 'failed',
  'report.categories': 'At a glance', 'report.duration': 'Completed in',
  'filter.all': 'All', 'filter.issues': 'Issues', 'filter.passed': 'Passed',
  'check.fix': 'How to fix', 'check.more': 'more',
  'history.title': 'History', 'history.empty': 'Audits you run will appear here.', 'history.open': 'Open', 'history.delete': 'Delete',
  'recent.title': 'Recent audits',
  'settings.title': 'Settings', 'settings.language': 'Language', 'settings.theme': 'Appearance',
  'settings.themeSystem': 'Automatic', 'settings.themeLight': 'Light', 'settings.themeDark': 'Dark',
  'settings.pages': 'Pages to crawl', 'settings.links': 'Links to check', 'settings.memory': 'Memory test cycles',
  'settings.device': 'Mobile device', 'settings.cfToken': 'Cloudflare API token (optional)',
  'settings.cfHelp': 'Read-only token (Zone: Read, Zone Settings: Read). Stored encrypted in your OS keychain.',
  'settings.save': 'Save', 'settings.saved': 'Saved',
  'mem.clean': 'No leaks detected', 'mem.suspicious': 'Possible leak', 'mem.leaking': 'Memory is leaking',
  'mem.chart': 'JS heap after garbage collection', 'mem.cycle': 'Cycle', 'mem.heap': 'Heap', 'mem.nodes': 'DOM nodes', 'mem.listeners': 'Listeners',
  'perf.vitals': 'Core Web Vitals', 'perf.requests': 'Requests', 'perf.weight': 'Page weight',
  'mobile.preview': 'As seen on', 'table.show': 'Show data table', 'table.hide': 'Hide data table',
  'footer.tagline': 'Website audits for Windows, macOS and Linux.',
  'footer.disclaimer': 'Scores are heuristics. Verify critical findings before acting on them.',
  'error.title': 'The audit could not finish',
  'features.title': 'What Sightline checks', 'features.lead': 'Ten audits, explained in plain language.',
  'features.what': 'What does it check?', 'features.why': 'Why it matters:',
  'nav.download': 'Download', 'web.desktopOnly': 'Desktop app',
  'web.desktopNote': 'Performance, iPhone & iPad and memory-leak tests run a real browser, so they need the free desktop app.',
  'web.getApp': 'Get the desktop app',
  'settings.ai': 'Connect AI apps (MCP)',
  'settings.aiHelp': 'Let Cursor, VS Code and other MCP-compatible apps run Sightline audits for you. Paste this into the app’s MCP settings, then ask: “Audit example.com”.',
  'settings.copy': 'Copy', 'settings.copied': 'Copied',
  'settings.report': 'Report style', 'settings.reportBrand': 'Match the audited website', 'settings.reportPlain': 'Sightline style',
};
export type Key = keyof typeof en;

const EXTRA: Record<string, Partial<Record<Key, string>>> = {
  es: { 'settings.report': 'Estilo del informe', 'settings.reportBrand': 'Igual que el sitio auditado', 'settings.reportPlain': 'Estilo Sightline', 'features.title': 'Qué revisa Sightline', 'features.lead': 'Ocho auditorías, explicadas con palabras sencillas.', 'features.what': '¿Qué revisa?', 'features.why': 'Por qué importa:', 'nav.download': 'Descargar', 'web.desktopOnly': 'App de escritorio', 'web.desktopNote': 'Las pruebas de rendimiento, iPhone/iPad y fugas de memoria usan un navegador real y requieren la app de escritorio gratuita.', 'web.getApp': 'Descargar la app', 'settings.ai': 'Conectar apps de IA (MCP)', 'settings.aiHelp': 'Permite que Cursor o VS Code ejecuten auditorías. Pega esto en los ajustes MCP de la app.', 'settings.copy': 'Copiar', 'settings.copied': 'Copiado' },
  fr: { 'settings.report': 'Style du rapport', 'settings.reportBrand': 'Comme le site audité', 'settings.reportPlain': 'Style Sightline', 'features.title': 'Ce que vérifie Sightline', 'features.lead': 'Huit audits, expliqués simplement.', 'features.what': 'Que vérifie-t-il ?', 'features.why': 'Pourquoi c’est important :', 'nav.download': 'Télécharger', 'web.desktopOnly': 'App de bureau', 'web.desktopNote': 'Les tests de performances, iPhone/iPad et fuites de mémoire utilisent un vrai navigateur et nécessitent l’app de bureau gratuite.', 'web.getApp': 'Télécharger l’app', 'settings.ai': 'Connecter des apps d’IA (MCP)', 'settings.aiHelp': 'Laissez Cursor ou VS Code lancer des audits. Collez ceci dans les réglages MCP de l’app.', 'settings.copy': 'Copier', 'settings.copied': 'Copié' },
  de: { 'settings.report': 'Berichtsstil', 'settings.reportBrand': 'Wie die geprüfte Website', 'settings.reportPlain': 'Sightline-Stil', 'features.title': 'Was Sightline prüft', 'features.lead': 'Acht Prüfungen, einfach erklärt.', 'features.what': 'Was wird geprüft?', 'features.why': 'Warum es wichtig ist:', 'nav.download': 'Download', 'web.desktopOnly': 'Desktop-App', 'web.desktopNote': 'Performance-, iPhone/iPad- und Speicherleck-Tests nutzen einen echten Browser und benötigen die kostenlose Desktop-App.', 'web.getApp': 'Desktop-App laden', 'settings.ai': 'KI-Apps verbinden (MCP)', 'settings.aiHelp': 'Lass Cursor oder VS Code Prüfungen ausführen. Füge dies in die MCP-Einstellungen der App ein.', 'settings.copy': 'Kopieren', 'settings.copied': 'Kopiert' },
  pt: { 'settings.report': 'Estilo do relatório', 'settings.reportBrand': 'Igual ao site auditado', 'settings.reportPlain': 'Estilo Sightline', 'features.title': 'O que o Sightline verifica', 'features.lead': 'Oito auditorias, explicadas de forma simples.', 'features.what': 'O que verifica?', 'features.why': 'Por que importa:', 'nav.download': 'Baixar', 'web.desktopOnly': 'App para desktop', 'web.desktopNote': 'Os testes de desempenho, iPhone/iPad e vazamento de memória usam um navegador real e exigem o app gratuito para desktop.', 'web.getApp': 'Baixar o app', 'settings.ai': 'Conectar apps de IA (MCP)', 'settings.aiHelp': 'Deixe o Cursor ou VS Code executar auditorias. Cole isto nas configurações MCP do app.', 'settings.copy': 'Copiar', 'settings.copied': 'Copiado' },
  it: { 'settings.report': 'Stile del report', 'settings.reportBrand': 'Come il sito analizzato', 'settings.reportPlain': 'Stile Sightline', 'features.title': 'Cosa controlla Sightline', 'features.lead': 'Otto analisi, spiegate in modo semplice.', 'features.what': 'Cosa controlla?', 'features.why': 'Perché è importante:', 'nav.download': 'Scarica', 'web.desktopOnly': 'App desktop', 'web.desktopNote': 'I test di prestazioni, iPhone/iPad e memory leak usano un browser reale e richiedono l’app desktop gratuita.', 'web.getApp': 'Scarica l’app', 'settings.ai': 'Collega app di IA (MCP)', 'settings.aiHelp': 'Permetti a Cursor o VS Code di eseguire analisi. Incolla questo nelle impostazioni MCP dell’app.', 'settings.copy': 'Copia', 'settings.copied': 'Copiato' },
  ru: { 'settings.report': 'Стиль отчёта', 'settings.reportBrand': 'Как у проверяемого сайта', 'settings.reportPlain': 'Стиль Sightline', 'features.title': 'Что проверяет Sightline', 'features.lead': 'Восемь проверок простыми словами.', 'features.what': 'Что проверяется?', 'features.why': 'Почему это важно:', 'nav.download': 'Скачать', 'web.desktopOnly': 'Настольное приложение', 'web.desktopNote': 'Проверки скорости, iPhone/iPad и утечек памяти используют настоящий браузер и требуют бесплатного настольного приложения.', 'web.getApp': 'Скачать приложение', 'settings.ai': 'Подключить ИИ-приложения (MCP)', 'settings.aiHelp': 'Позвольте Cursor или VS Code запускать аудиты. Вставьте это в настройки MCP приложения.', 'settings.copy': 'Копировать', 'settings.copied': 'Скопировано' },
  tr: { 'settings.report': 'Rapor stili', 'settings.reportBrand': 'Denetlenen siteyle aynı', 'settings.reportPlain': 'Sightline stili', 'features.title': 'Sightline neyi denetler', 'features.lead': 'Sade bir dille anlatılmış sekiz denetim.', 'features.what': 'Neyi kontrol eder?', 'features.why': 'Neden önemli:', 'nav.download': 'İndir', 'web.desktopOnly': 'Masaüstü uygulaması', 'web.desktopNote': 'Performans, iPhone/iPad ve bellek sızıntısı testleri gerçek bir tarayıcı kullanır; ücretsiz masaüstü uygulaması gerekir.', 'web.getApp': 'Uygulamayı indir', 'settings.ai': 'Yapay zekâ uygulamalarını bağla (MCP)', 'settings.aiHelp': 'Cursor veya VS Code’un denetim çalıştırmasına izin verin. Bunu uygulamanın MCP ayarlarına yapıştırın.', 'settings.copy': 'Kopyala', 'settings.copied': 'Kopyalandı' },
  ar: { 'settings.report': 'نمط التقرير', 'settings.reportBrand': 'مطابق للموقع المدقَّق', 'settings.reportPlain': 'نمط Sightline', 'features.title': 'ما الذي يفحصه Sightline', 'features.lead': 'ثمانية فحوصات بشرح بسيط.', 'features.what': 'ماذا يفحص؟', 'features.why': 'لماذا يهم:', 'nav.download': 'تنزيل', 'web.desktopOnly': 'تطبيق سطح المكتب', 'web.desktopNote': 'اختبارات الأداء وiPhone/iPad وتسرّب الذاكرة تستخدم متصفحًا حقيقيًا وتتطلب تطبيق سطح المكتب المجاني.', 'web.getApp': 'تنزيل التطبيق', 'settings.ai': 'ربط تطبيقات الذكاء الاصطناعي (MCP)', 'settings.aiHelp': 'اسمح لـ Cursor أو VS Code بتشغيل عمليات التدقيق. الصق هذا في إعدادات MCP للتطبيق.', 'settings.copy': 'نسخ', 'settings.copied': 'تم النسخ' },
  ur: { 'settings.report': 'رپورٹ کا انداز', 'settings.reportBrand': 'آڈٹ شدہ ویب سائٹ جیسا', 'settings.reportPlain': 'Sightline انداز', 'features.title': 'Sightline کیا جانچتا ہے', 'features.lead': 'آٹھ آڈٹ، آسان زبان میں۔', 'features.what': 'یہ کیا جانچتا ہے؟', 'features.why': 'یہ کیوں اہم ہے:', 'nav.download': 'ڈاؤن لوڈ', 'web.desktopOnly': 'ڈیسک ٹاپ ایپ', 'web.desktopNote': 'کارکردگی، iPhone/iPad اور میموری لیک کے ٹیسٹ اصلی براؤزر استعمال کرتے ہیں، اس لیے مفت ڈیسک ٹاپ ایپ درکار ہے۔', 'web.getApp': 'ایپ ڈاؤن لوڈ کریں', 'settings.ai': 'AI ایپس جوڑیں (MCP)', 'settings.aiHelp': 'Cursor یا VS Code کو آڈٹ چلانے دیں۔ یہ ایپ کی MCP ترتیبات میں پیسٹ کریں۔', 'settings.copy': 'کاپی', 'settings.copied': 'کاپی ہو گیا' },
  hi: { 'settings.report': 'रिपोर्ट शैली', 'settings.reportBrand': 'ऑडिट की गई वेबसाइट जैसी', 'settings.reportPlain': 'Sightline शैली', 'features.title': 'Sightline क्या जाँचता है', 'features.lead': 'आठ ऑडिट, आसान भाषा में।', 'features.what': 'यह क्या जाँचता है?', 'features.why': 'यह क्यों ज़रूरी है:', 'nav.download': 'डाउनलोड', 'web.desktopOnly': 'डेस्कटॉप ऐप', 'web.desktopNote': 'परफ़ॉर्मेंस, iPhone/iPad और मेमोरी लीक टेस्ट असली ब्राउज़र चलाते हैं, इसलिए मुफ़्त डेस्कटॉप ऐप ज़रूरी है।', 'web.getApp': 'ऐप डाउनलोड करें', 'settings.ai': 'AI ऐप्स जोड़ें (MCP)', 'settings.aiHelp': 'Cursor या VS Code को ऑडिट चलाने दें। इसे ऐप की MCP सेटिंग्स में पेस्ट करें।', 'settings.copy': 'कॉपी', 'settings.copied': 'कॉपी हो गया' },
  zh: { 'settings.report': '报告样式', 'settings.reportBrand': '匹配被审计网站', 'settings.reportPlain': 'Sightline 样式', 'features.title': 'Sightline 检查什么', 'features.lead': '八项审计，通俗易懂。', 'features.what': '检查哪些内容？', 'features.why': '为什么重要：', 'nav.download': '下载', 'web.desktopOnly': '桌面应用', 'web.desktopNote': '性能、iPhone/iPad 与内存泄漏测试需要真实浏览器，请使用免费的桌面应用。', 'web.getApp': '下载桌面应用', 'settings.ai': '连接 AI 应用（MCP）', 'settings.aiHelp': '让 Cursor 或 VS Code 为你运行审计。将以下内容粘贴到应用的 MCP 设置中。', 'settings.copy': '复制', 'settings.copied': '已复制' },
  ja: { 'settings.report': 'レポートのスタイル', 'settings.reportBrand': '監査対象サイトに合わせる', 'settings.reportPlain': 'Sightline スタイル', 'features.title': 'Sightline がチェックすること', 'features.lead': '8 つの監査をわかりやすく。', 'features.what': '何をチェックする？', 'features.why': 'なぜ重要か：', 'nav.download': 'ダウンロード', 'web.desktopOnly': 'デスクトップ版', 'web.desktopNote': 'パフォーマンス、iPhone/iPad、メモリリークのテストは実際のブラウザを使うため、無料のデスクトップ版が必要です。', 'web.getApp': 'アプリを入手', 'settings.ai': 'AI アプリと連携（MCP）', 'settings.aiHelp': 'Cursor、VS Code から監査を実行できます。これをアプリの MCP 設定に貼り付けてください。', 'settings.copy': 'コピー', 'settings.copied': 'コピーしました' },
  ko: { 'settings.report': '보고서 스타일', 'settings.reportBrand': '감사한 웹사이트에 맞춤', 'settings.reportPlain': 'Sightline 스타일', 'features.title': 'Sightline이 확인하는 것', 'features.lead': '여덟 가지 감사를 쉬운 말로.', 'features.what': '무엇을 확인하나요?', 'features.why': '왜 중요한가요:', 'nav.download': '다운로드', 'web.desktopOnly': '데스크톱 앱', 'web.desktopNote': '성능, iPhone/iPad, 메모리 누수 테스트는 실제 브라우저를 사용하므로 무료 데스크톱 앱이 필요합니다.', 'web.getApp': '앱 다운로드', 'settings.ai': 'AI 앱 연결 (MCP)', 'settings.aiHelp': 'Cursor, VS Code에서 감사를 실행하세요. 이 내용을 앱의 MCP 설정에 붙여넣으세요.', 'settings.copy': '복사', 'settings.copied': '복사됨' },
};
type Dict = Partial<Record<Key, string>>;

const es: Dict = {
  'nav.audit': 'Auditar', 'nav.history': 'Historial', 'nav.settings': 'Ajustes',
  'hero.title': 'Cada detalle. Auditado.', 'hero.lead': 'SEO, hreflang, enlaces, rendimiento, Cloudflare, iPhone y fugas de memoria, en un solo lugar.',
  'hero.placeholder': 'Introduce un sitio web, p. ej. apple.com', 'hero.button': 'Auditar', 'modules.title': 'Incluir',
  'cat.links': 'Enlaces', 'cat.website': 'Salud del sitio', 'cat.performance': 'Rendimiento', 'cat.memory': 'Fugas de memoria',
  'run.title': 'Auditando', 'run.cancel': 'Cancelar', 'report.overall': 'Puntuación global', 'report.exportPdf': 'Exportar PDF',
  'report.newAudit': 'Nueva auditoría', 'report.passed': 'superadas', 'report.warnings': 'avisos', 'report.failed': 'fallidas',
  'report.categories': 'De un vistazo', 'report.duration': 'Completado en', 'filter.all': 'Todo', 'filter.issues': 'Problemas', 'filter.passed': 'Superadas',
  'check.fix': 'Cómo corregirlo', 'check.more': 'más', 'history.title': 'Historial', 'history.empty': 'Tus auditorías aparecerán aquí.',
  'history.open': 'Abrir', 'history.delete': 'Eliminar', 'recent.title': 'Auditorías recientes', 'settings.title': 'Ajustes',
  'settings.language': 'Idioma', 'settings.theme': 'Apariencia', 'settings.themeSystem': 'Automático', 'settings.themeLight': 'Claro', 'settings.themeDark': 'Oscuro',
  'settings.pages': 'Páginas a rastrear', 'settings.links': 'Enlaces a comprobar', 'settings.memory': 'Ciclos de prueba de memoria',
  'settings.device': 'Dispositivo móvil', 'settings.cfToken': 'Token de API de Cloudflare (opcional)',
  'settings.cfHelp': 'Token de solo lectura. Se guarda cifrado en el llavero del sistema.', 'settings.save': 'Guardar', 'settings.saved': 'Guardado',
  'mem.clean': 'Sin fugas detectadas', 'mem.suspicious': 'Posible fuga', 'mem.leaking': 'Hay fuga de memoria',
  'mem.chart': 'Heap de JS tras la recolección de basura', 'mem.cycle': 'Ciclo', 'mem.nodes': 'Nodos DOM', 'mem.listeners': 'Listeners',
  'perf.requests': 'Solicitudes', 'perf.weight': 'Peso de la página', 'mobile.preview': 'Visto en',
  'table.show': 'Mostrar tabla de datos', 'table.hide': 'Ocultar tabla de datos',
  'footer.tagline': 'Auditorías web para Windows, macOS y Linux.', 'footer.disclaimer': 'Las puntuaciones son heurísticas. Verifica los hallazgos críticos.',
  'error.title': 'La auditoría no pudo terminar',
};

const fr: Dict = {
  'nav.audit': 'Audit', 'nav.history': 'Historique', 'nav.settings': 'Réglages',
  'hero.title': 'Chaque détail. Audité.', 'hero.lead': 'SEO, hreflang, liens, performances, Cloudflare, iPhone et fuites de mémoire, réunis au même endroit.',
  'hero.placeholder': 'Saisissez un site, par ex. apple.com', 'hero.button': 'Auditer', 'modules.title': 'Inclure',
  'cat.links': 'Liens', 'cat.website': 'Santé du site', 'cat.performance': 'Performances', 'cat.memory': 'Fuites de mémoire',
  'run.title': 'Audit en cours', 'run.cancel': 'Annuler', 'report.overall': 'Score global', 'report.exportPdf': 'Exporter en PDF',
  'report.newAudit': 'Nouvel audit', 'report.passed': 'réussis', 'report.warnings': 'avertissements', 'report.failed': 'échecs',
  'report.categories': 'En un coup d’œil', 'report.duration': 'Terminé en', 'filter.all': 'Tout', 'filter.issues': 'Problèmes', 'filter.passed': 'Réussis',
  'check.fix': 'Comment corriger', 'check.more': 'de plus', 'history.title': 'Historique', 'history.empty': 'Vos audits apparaîtront ici.',
  'history.open': 'Ouvrir', 'history.delete': 'Supprimer', 'recent.title': 'Audits récents', 'settings.title': 'Réglages',
  'settings.language': 'Langue', 'settings.theme': 'Apparence', 'settings.themeSystem': 'Automatique', 'settings.themeLight': 'Clair', 'settings.themeDark': 'Sombre',
  'settings.pages': 'Pages à explorer', 'settings.links': 'Liens à vérifier', 'settings.memory': 'Cycles du test mémoire',
  'settings.device': 'Appareil mobile', 'settings.cfToken': 'Jeton API Cloudflare (facultatif)',
  'settings.cfHelp': 'Jeton en lecture seule, stocké chiffré dans le trousseau du système.', 'settings.save': 'Enregistrer', 'settings.saved': 'Enregistré',
  'mem.clean': 'Aucune fuite détectée', 'mem.suspicious': 'Fuite possible', 'mem.leaking': 'La mémoire fuit',
  'mem.chart': 'Tas JS après le ramasse-miettes', 'mem.cycle': 'Cycle', 'mem.heap': 'Tas', 'mem.nodes': 'Nœuds DOM', 'mem.listeners': 'Écouteurs',
  'perf.requests': 'Requêtes', 'perf.weight': 'Poids de la page', 'mobile.preview': 'Vu sur',
  'table.show': 'Afficher le tableau', 'table.hide': 'Masquer le tableau',
  'footer.tagline': 'Audits de sites pour Windows, macOS et Linux.', 'footer.disclaimer': 'Les scores sont indicatifs. Vérifiez les résultats critiques.',
  'error.title': 'L’audit n’a pas pu aboutir',
};

const de: Dict = {
  'nav.audit': 'Prüfen', 'nav.history': 'Verlauf', 'nav.settings': 'Einstellungen',
  'hero.title': 'Jedes Detail. Geprüft.', 'hero.lead': 'SEO, hreflang, Links, Performance, Cloudflare, iPhone und Speicherlecks – alles an einem Ort.',
  'hero.placeholder': 'Website eingeben, z. B. apple.com', 'hero.button': 'Prüfen', 'modules.title': 'Enthalten',
  'cat.website': 'Website-Zustand', 'cat.memory': 'Speicherlecks',
  'run.title': 'Wird geprüft', 'run.cancel': 'Abbrechen', 'report.overall': 'Gesamtwertung', 'report.exportPdf': 'Als PDF exportieren',
  'report.newAudit': 'Neue Prüfung', 'report.passed': 'bestanden', 'report.warnings': 'Warnungen', 'report.failed': 'fehlgeschlagen',
  'report.categories': 'Auf einen Blick', 'report.duration': 'Abgeschlossen in', 'filter.all': 'Alle', 'filter.issues': 'Probleme', 'filter.passed': 'Bestanden',
  'check.fix': 'So beheben', 'check.more': 'weitere', 'history.title': 'Verlauf', 'history.empty': 'Deine Prüfungen erscheinen hier.',
  'history.open': 'Öffnen', 'history.delete': 'Löschen', 'recent.title': 'Letzte Prüfungen', 'settings.title': 'Einstellungen',
  'settings.language': 'Sprache', 'settings.theme': 'Darstellung', 'settings.themeSystem': 'Automatisch', 'settings.themeLight': 'Hell', 'settings.themeDark': 'Dunkel',
  'settings.pages': 'Zu crawlende Seiten', 'settings.links': 'Zu prüfende Links', 'settings.memory': 'Zyklen des Speichertests',
  'settings.device': 'Mobilgerät', 'settings.cfToken': 'Cloudflare-API-Token (optional)',
  'settings.cfHelp': 'Nur-Lese-Token, verschlüsselt im Schlüsselbund des Systems gespeichert.', 'settings.save': 'Sichern', 'settings.saved': 'Gesichert',
  'mem.clean': 'Keine Lecks gefunden', 'mem.suspicious': 'Mögliches Leck', 'mem.leaking': 'Speicher läuft voll',
  'mem.chart': 'JS-Heap nach Garbage Collection', 'mem.cycle': 'Zyklus', 'mem.nodes': 'DOM-Knoten', 'mem.listeners': 'Listener',
  'perf.requests': 'Anfragen', 'perf.weight': 'Seitengewicht', 'mobile.preview': 'So sieht es aus auf',
  'table.show': 'Datentabelle anzeigen', 'table.hide': 'Datentabelle ausblenden',
  'footer.tagline': 'Website-Prüfungen für Windows, macOS und Linux.', 'footer.disclaimer': 'Wertungen sind Heuristiken. Prüfe kritische Befunde selbst.',
  'error.title': 'Die Prüfung konnte nicht abgeschlossen werden',
};

const pt: Dict = {
  'nav.audit': 'Auditar', 'nav.history': 'Histórico', 'nav.settings': 'Ajustes',
  'hero.title': 'Cada detalhe. Auditado.', 'hero.lead': 'SEO, hreflang, links, desempenho, Cloudflare, iPhone e vazamentos de memória, em um só lugar.',
  'hero.placeholder': 'Digite um site, ex.: apple.com', 'hero.button': 'Auditar', 'modules.title': 'Incluir',
  'cat.website': 'Saúde do site', 'cat.performance': 'Desempenho', 'cat.memory': 'Vazamentos de memória',
  'run.title': 'Auditando', 'run.cancel': 'Cancelar', 'report.overall': 'Pontuação geral', 'report.exportPdf': 'Exportar PDF',
  'report.newAudit': 'Nova auditoria', 'report.passed': 'aprovadas', 'report.warnings': 'avisos', 'report.failed': 'falhas',
  'report.categories': 'Visão geral', 'report.duration': 'Concluído em', 'filter.all': 'Tudo', 'filter.issues': 'Problemas', 'filter.passed': 'Aprovadas',
  'check.fix': 'Como corrigir', 'check.more': 'mais', 'history.title': 'Histórico', 'history.empty': 'Suas auditorias aparecerão aqui.',
  'history.open': 'Abrir', 'history.delete': 'Apagar', 'recent.title': 'Auditorias recentes', 'settings.title': 'Ajustes',
  'settings.language': 'Idioma', 'settings.theme': 'Aparência', 'settings.themeSystem': 'Automático', 'settings.themeLight': 'Claro', 'settings.themeDark': 'Escuro',
  'settings.pages': 'Páginas para rastrear', 'settings.links': 'Links para verificar', 'settings.memory': 'Ciclos do teste de memória',
  'settings.device': 'Dispositivo móvel', 'settings.cfToken': 'Token da API Cloudflare (opcional)',
  'settings.cfHelp': 'Token somente leitura, guardado criptografado no chaveiro do sistema.', 'settings.save': 'Salvar', 'settings.saved': 'Salvo',
  'mem.clean': 'Nenhum vazamento', 'mem.suspicious': 'Possível vazamento', 'mem.leaking': 'A memória está vazando',
  'mem.chart': 'Heap JS após coleta de lixo', 'mem.cycle': 'Ciclo', 'mem.nodes': 'Nós do DOM', 'mem.listeners': 'Listeners',
  'perf.requests': 'Requisições', 'perf.weight': 'Peso da página', 'mobile.preview': 'Visto no',
  'table.show': 'Mostrar tabela', 'table.hide': 'Ocultar tabela',
  'footer.tagline': 'Auditorias de sites para Windows, macOS e Linux.', 'footer.disclaimer': 'As pontuações são heurísticas. Verifique os achados críticos.',
  'error.title': 'Não foi possível concluir a auditoria',
};

const it: Dict = {
  'nav.audit': 'Analizza', 'nav.history': 'Cronologia', 'nav.settings': 'Impostazioni',
  'hero.title': 'Ogni dettaglio. Analizzato.', 'hero.lead': 'SEO, hreflang, link, prestazioni, Cloudflare, iPhone e memory leak, in un unico posto.',
  'hero.placeholder': 'Inserisci un sito, es. apple.com', 'hero.button': 'Analizza', 'modules.title': 'Includi',
  'cat.website': 'Stato del sito', 'cat.performance': 'Prestazioni', 'cat.memory': 'Perdite di memoria',
  'run.title': 'Analisi in corso', 'run.cancel': 'Annulla', 'report.overall': 'Punteggio complessivo', 'report.exportPdf': 'Esporta PDF',
  'report.newAudit': 'Nuova analisi', 'report.passed': 'superati', 'report.warnings': 'avvisi', 'report.failed': 'non superati',
  'report.categories': 'In sintesi', 'report.duration': 'Completato in', 'filter.all': 'Tutti', 'filter.issues': 'Problemi', 'filter.passed': 'Superati',
  'check.fix': 'Come risolvere', 'check.more': 'altri', 'history.title': 'Cronologia', 'history.empty': 'Le tue analisi compariranno qui.',
  'history.open': 'Apri', 'history.delete': 'Elimina', 'recent.title': 'Analisi recenti', 'settings.title': 'Impostazioni',
  'settings.language': 'Lingua', 'settings.theme': 'Aspetto', 'settings.themeSystem': 'Automatico', 'settings.themeLight': 'Chiaro', 'settings.themeDark': 'Scuro',
  'settings.pages': 'Pagine da scansionare', 'settings.links': 'Link da verificare', 'settings.memory': 'Cicli del test di memoria',
  'settings.device': 'Dispositivo mobile', 'settings.cfToken': 'Token API Cloudflare (facoltativo)',
  'settings.cfHelp': 'Token di sola lettura, salvato cifrato nel portachiavi di sistema.', 'settings.save': 'Salva', 'settings.saved': 'Salvato',
  'mem.clean': 'Nessuna perdita rilevata', 'mem.suspicious': 'Possibile perdita', 'mem.leaking': 'La memoria perde',
  'mem.chart': 'Heap JS dopo la garbage collection', 'mem.cycle': 'Ciclo', 'mem.nodes': 'Nodi DOM', 'mem.listeners': 'Listener',
  'perf.requests': 'Richieste', 'perf.weight': 'Peso della pagina', 'mobile.preview': 'Come appare su',
  'table.show': 'Mostra tabella dati', 'table.hide': 'Nascondi tabella dati',
  'footer.tagline': 'Analisi di siti web per Windows, macOS e Linux.', 'footer.disclaimer': 'I punteggi sono indicativi. Verifica i risultati critici.',
  'error.title': 'Impossibile completare l’analisi',
};

const ru: Dict = {
  'nav.audit': 'Аудит', 'nav.history': 'История', 'nav.settings': 'Настройки',
  'hero.title': 'Каждая деталь. Проверена.', 'hero.lead': 'SEO, hreflang, ссылки, скорость, Cloudflare, iPhone и утечки памяти — в одном месте.',
  'hero.placeholder': 'Введите сайт, например apple.com', 'hero.button': 'Проверить', 'modules.title': 'Включить',
  'cat.hreflang': 'Hreflang', 'cat.links': 'Ссылки', 'cat.website': 'Состояние сайта', 'cat.performance': 'Скорость', 'cat.memory': 'Утечки памяти',
  'run.title': 'Идёт аудит', 'run.cancel': 'Отменить', 'report.overall': 'Общая оценка', 'report.exportPdf': 'Экспорт в PDF',
  'report.newAudit': 'Новый аудит', 'report.passed': 'пройдено', 'report.warnings': 'предупреждений', 'report.failed': 'ошибок',
  'report.categories': 'Кратко', 'report.duration': 'Выполнено за', 'filter.all': 'Все', 'filter.issues': 'Проблемы', 'filter.passed': 'Пройдено',
  'check.fix': 'Как исправить', 'check.more': 'ещё', 'history.title': 'История', 'history.empty': 'Здесь появятся ваши аудиты.',
  'history.open': 'Открыть', 'history.delete': 'Удалить', 'recent.title': 'Недавние аудиты', 'settings.title': 'Настройки',
  'settings.language': 'Язык', 'settings.theme': 'Оформление', 'settings.themeSystem': 'Авто', 'settings.themeLight': 'Светлое', 'settings.themeDark': 'Тёмное',
  'settings.pages': 'Страниц для обхода', 'settings.links': 'Ссылок для проверки', 'settings.memory': 'Циклов теста памяти',
  'settings.device': 'Мобильное устройство', 'settings.cfToken': 'API-токен Cloudflare (необязательно)',
  'settings.cfHelp': 'Токен только для чтения, хранится зашифрованным в системной связке ключей.', 'settings.save': 'Сохранить', 'settings.saved': 'Сохранено',
  'mem.clean': 'Утечек не найдено', 'mem.suspicious': 'Возможная утечка', 'mem.leaking': 'Память утекает',
  'mem.chart': 'JS-куча после сборки мусора', 'mem.cycle': 'Цикл', 'mem.heap': 'Куча', 'mem.nodes': 'DOM-узлы', 'mem.listeners': 'Обработчики',
  'perf.requests': 'Запросы', 'perf.weight': 'Вес страницы', 'mobile.preview': 'Так выглядит на',
  'table.show': 'Показать таблицу', 'table.hide': 'Скрыть таблицу',
  'footer.tagline': 'Аудит сайтов для Windows, macOS и Linux.', 'footer.disclaimer': 'Оценки эвристические. Проверяйте критичные находки вручную.',
  'error.title': 'Аудит не удалось завершить',
};

const tr: Dict = {
  'nav.audit': 'Denetle', 'nav.history': 'Geçmiş', 'nav.settings': 'Ayarlar',
  'hero.title': 'Her ayrıntı. Denetlendi.', 'hero.lead': 'SEO, hreflang, bağlantılar, performans, Cloudflare, iPhone ve bellek sızıntıları tek bir yerde.',
  'hero.placeholder': 'Bir web sitesi girin, ör. apple.com', 'hero.button': 'Denetle', 'modules.title': 'Dahil et',
  'cat.links': 'Bağlantılar', 'cat.website': 'Site sağlığı', 'cat.performance': 'Performans', 'cat.memory': 'Bellek sızıntıları',
  'run.title': 'Denetleniyor', 'run.cancel': 'İptal', 'report.overall': 'Genel puan', 'report.exportPdf': 'PDF olarak dışa aktar',
  'report.newAudit': 'Yeni denetim', 'report.passed': 'başarılı', 'report.warnings': 'uyarı', 'report.failed': 'başarısız',
  'report.categories': 'Bir bakışta', 'report.duration': 'Tamamlanma süresi', 'filter.all': 'Tümü', 'filter.issues': 'Sorunlar', 'filter.passed': 'Başarılı',
  'check.fix': 'Nasıl düzeltilir', 'check.more': 'daha', 'history.title': 'Geçmiş', 'history.empty': 'Denetimleriniz burada görünecek.',
  'history.open': 'Aç', 'history.delete': 'Sil', 'recent.title': 'Son denetimler', 'settings.title': 'Ayarlar',
  'settings.language': 'Dil', 'settings.theme': 'Görünüm', 'settings.themeSystem': 'Otomatik', 'settings.themeLight': 'Açık', 'settings.themeDark': 'Koyu',
  'settings.pages': 'Taranacak sayfa', 'settings.links': 'Kontrol edilecek bağlantı', 'settings.memory': 'Bellek testi döngüsü',
  'settings.device': 'Mobil cihaz', 'settings.cfToken': 'Cloudflare API anahtarı (isteğe bağlı)',
  'settings.cfHelp': 'Salt okunur anahtar; sistem anahtar zincirinde şifreli saklanır.', 'settings.save': 'Kaydet', 'settings.saved': 'Kaydedildi',
  'mem.clean': 'Sızıntı bulunmadı', 'mem.suspicious': 'Olası sızıntı', 'mem.leaking': 'Bellek sızıyor',
  'mem.chart': 'Çöp toplama sonrası JS yığını', 'mem.cycle': 'Döngü', 'mem.heap': 'Yığın', 'mem.nodes': 'DOM düğümleri', 'mem.listeners': 'Dinleyiciler',
  'perf.requests': 'İstekler', 'perf.weight': 'Sayfa boyutu', 'mobile.preview': 'Şurada görünümü:',
  'table.show': 'Veri tablosunu göster', 'table.hide': 'Veri tablosunu gizle',
  'footer.tagline': 'Windows, macOS ve Linux için web sitesi denetimi.', 'footer.disclaimer': 'Puanlar sezgiseldir. Kritik bulguları doğrulayın.',
  'error.title': 'Denetim tamamlanamadı',
};

const ar: Dict = {
  'nav.audit': 'تدقيق', 'nav.history': 'السجل', 'nav.settings': 'الإعدادات',
  'hero.title': 'كل التفاصيل. مدقّقة.', 'hero.lead': 'تحسين محركات البحث وhreflang والروابط والأداء وCloudflare وiPhone وتسرّب الذاكرة — في مكان واحد.',
  'hero.placeholder': 'أدخل موقعًا، مثل apple.com', 'hero.button': 'تدقيق', 'modules.title': 'تضمين',
  'cat.seo': 'تحسين البحث', 'cat.links': 'الروابط', 'cat.website': 'صحة الموقع', 'cat.performance': 'الأداء', 'cat.cloudflare': 'Cloudflare وDNS', 'cat.mobile': 'iPhone وiPad', 'cat.memory': 'تسرّب الذاكرة',
  'run.title': 'جارٍ التدقيق', 'run.cancel': 'إلغاء', 'report.overall': 'النتيجة الإجمالية', 'report.exportPdf': 'تصدير PDF',
  'report.newAudit': 'تدقيق جديد', 'report.passed': 'ناجح', 'report.warnings': 'تحذيرات', 'report.failed': 'فاشل',
  'report.categories': 'نظرة سريعة', 'report.duration': 'اكتمل في', 'filter.all': 'الكل', 'filter.issues': 'المشكلات', 'filter.passed': 'الناجحة',
  'check.fix': 'طريقة الإصلاح', 'check.more': 'أخرى', 'history.title': 'السجل', 'history.empty': 'ستظهر عمليات التدقيق هنا.',
  'history.open': 'فتح', 'history.delete': 'حذف', 'recent.title': 'عمليات التدقيق الأخيرة', 'settings.title': 'الإعدادات',
  'settings.language': 'اللغة', 'settings.theme': 'المظهر', 'settings.themeSystem': 'تلقائي', 'settings.themeLight': 'فاتح', 'settings.themeDark': 'داكن',
  'settings.pages': 'عدد الصفحات للزحف', 'settings.links': 'عدد الروابط للفحص', 'settings.memory': 'دورات اختبار الذاكرة',
  'settings.device': 'الجهاز المحمول', 'settings.cfToken': 'رمز Cloudflare API (اختياري)',
  'settings.cfHelp': 'رمز للقراءة فقط، يُحفظ مشفّرًا في سلسلة مفاتيح النظام.', 'settings.save': 'حفظ', 'settings.saved': 'تم الحفظ',
  'mem.clean': 'لا يوجد تسرّب', 'mem.suspicious': 'تسرّب محتمل', 'mem.leaking': 'الذاكرة تتسرّب',
  'mem.chart': 'كومة JS بعد جمع البيانات المهملة', 'mem.cycle': 'الدورة', 'mem.heap': 'الكومة', 'mem.nodes': 'عُقد DOM', 'mem.listeners': 'المستمعون',
  'perf.vitals': 'مؤشرات الويب الأساسية', 'perf.requests': 'الطلبات', 'perf.weight': 'حجم الصفحة', 'mobile.preview': 'كما يظهر على',
  'table.show': 'إظهار جدول البيانات', 'table.hide': 'إخفاء جدول البيانات',
  'footer.tagline': 'تدقيق المواقع لأنظمة Windows وmacOS وLinux.', 'footer.disclaimer': 'النتائج تقديرية. تحقّق من النتائج الحرجة قبل اتخاذ أي إجراء.',
  'error.title': 'تعذّر إكمال التدقيق',
};

const ur: Dict = {
  'nav.audit': 'آڈٹ', 'nav.history': 'تاریخچہ', 'nav.settings': 'ترتیبات',
  'hero.title': 'ہر تفصیل۔ جانچی ہوئی۔', 'hero.lead': 'SEO، hreflang، لنکس، کارکردگی، Cloudflare، iPhone اور میموری لیک — سب ایک جگہ۔',
  'hero.placeholder': 'ویب سائٹ درج کریں، مثلاً apple.com', 'hero.button': 'آڈٹ کریں', 'modules.title': 'شامل کریں',
  'cat.links': 'لنکس', 'cat.website': 'ویب سائٹ کی صحت', 'cat.performance': 'کارکردگی', 'cat.memory': 'میموری لیک',
  'run.title': 'آڈٹ جاری ہے', 'run.cancel': 'منسوخ کریں', 'report.overall': 'مجموعی اسکور', 'report.exportPdf': 'PDF برآمد کریں',
  'report.newAudit': 'نیا آڈٹ', 'report.passed': 'کامیاب', 'report.warnings': 'انتباہات', 'report.failed': 'ناکام',
  'report.categories': 'ایک نظر میں', 'report.duration': 'مکمل ہوا', 'filter.all': 'سب', 'filter.issues': 'مسائل', 'filter.passed': 'کامیاب',
  'check.fix': 'درست کرنے کا طریقہ', 'check.more': 'مزید', 'history.title': 'تاریخچہ', 'history.empty': 'آپ کے آڈٹ یہاں نظر آئیں گے۔',
  'history.open': 'کھولیں', 'history.delete': 'حذف کریں', 'recent.title': 'حالیہ آڈٹ', 'settings.title': 'ترتیبات',
  'settings.language': 'زبان', 'settings.theme': 'ظاہری شکل', 'settings.themeSystem': 'خودکار', 'settings.themeLight': 'روشن', 'settings.themeDark': 'گہرا',
  'settings.pages': 'کرال کیے جانے والے صفحات', 'settings.links': 'جانچے جانے والے لنکس', 'settings.memory': 'میموری ٹیسٹ کے چکر',
  'settings.device': 'موبائل ڈیوائس', 'settings.cfToken': 'Cloudflare API ٹوکن (اختیاری)',
  'settings.cfHelp': 'صرف پڑھنے والا ٹوکن، سسٹم کی کی چین میں خفیہ طور پر محفوظ۔', 'settings.save': 'محفوظ کریں', 'settings.saved': 'محفوظ ہو گیا',
  'mem.clean': 'کوئی لیک نہیں ملا', 'mem.suspicious': 'ممکنہ لیک', 'mem.leaking': 'میموری لیک ہو رہی ہے',
  'mem.chart': 'گاربیج کلیکشن کے بعد JS ہیپ', 'mem.cycle': 'چکر', 'mem.heap': 'ہیپ', 'mem.nodes': 'DOM نوڈز', 'mem.listeners': 'لسنرز',
  'perf.requests': 'درخواستیں', 'perf.weight': 'صفحے کا حجم', 'mobile.preview': 'اس پر کیسا دکھتا ہے',
  'table.show': 'ڈیٹا ٹیبل دکھائیں', 'table.hide': 'ڈیٹا ٹیبل چھپائیں',
  'footer.tagline': 'Windows، macOS اور Linux کے لیے ویب سائٹ آڈٹ۔', 'footer.disclaimer': 'اسکور اندازے ہیں۔ اہم نتائج کی خود تصدیق کریں۔',
  'error.title': 'آڈٹ مکمل نہیں ہو سکا',
};

const hi: Dict = {
  'nav.audit': 'ऑडिट', 'nav.history': 'इतिहास', 'nav.settings': 'सेटिंग्स',
  'hero.title': 'हर बारीकी। जाँची गई।', 'hero.lead': 'SEO, hreflang, लिंक, परफ़ॉर्मेंस, Cloudflare, iPhone और मेमोरी लीक — सब एक जगह।',
  'hero.placeholder': 'वेबसाइट डालें, जैसे apple.com', 'hero.button': 'ऑडिट करें', 'modules.title': 'शामिल करें',
  'cat.links': 'लिंक', 'cat.website': 'वेबसाइट स्वास्थ्य', 'cat.performance': 'परफ़ॉर्मेंस', 'cat.memory': 'मेमोरी लीक',
  'run.title': 'ऑडिट हो रहा है', 'run.cancel': 'रद्द करें', 'report.overall': 'कुल स्कोर', 'report.exportPdf': 'PDF निर्यात करें',
  'report.newAudit': 'नया ऑडिट', 'report.passed': 'सफल', 'report.warnings': 'चेतावनियाँ', 'report.failed': 'असफल',
  'report.categories': 'एक नज़र में', 'report.duration': 'पूरा हुआ', 'filter.all': 'सभी', 'filter.issues': 'समस्याएँ', 'filter.passed': 'सफल',
  'check.fix': 'कैसे ठीक करें', 'check.more': 'और', 'history.title': 'इतिहास', 'history.empty': 'आपके ऑडिट यहाँ दिखेंगे।',
  'history.open': 'खोलें', 'history.delete': 'हटाएँ', 'recent.title': 'हाल के ऑडिट', 'settings.title': 'सेटिंग्स',
  'settings.language': 'भाषा', 'settings.theme': 'रूप', 'settings.themeSystem': 'स्वचालित', 'settings.themeLight': 'हल्का', 'settings.themeDark': 'गहरा',
  'settings.pages': 'क्रॉल करने के पेज', 'settings.links': 'जाँचने के लिंक', 'settings.memory': 'मेमोरी टेस्ट चक्र',
  'settings.device': 'मोबाइल डिवाइस', 'settings.cfToken': 'Cloudflare API टोकन (वैकल्पिक)',
  'settings.cfHelp': 'केवल-पढ़ने वाला टोकन, सिस्टम कीचेन में एन्क्रिप्ट करके रखा जाता है।', 'settings.save': 'सहेजें', 'settings.saved': 'सहेजा गया',
  'mem.clean': 'कोई लीक नहीं मिला', 'mem.suspicious': 'संभावित लीक', 'mem.leaking': 'मेमोरी लीक हो रही है',
  'mem.chart': 'गार्बेज कलेक्शन के बाद JS हीप', 'mem.cycle': 'चक्र', 'mem.heap': 'हीप', 'mem.nodes': 'DOM नोड', 'mem.listeners': 'लिसनर',
  'perf.requests': 'अनुरोध', 'perf.weight': 'पेज का आकार', 'mobile.preview': 'ऐसा दिखता है',
  'table.show': 'डेटा तालिका दिखाएँ', 'table.hide': 'डेटा तालिका छिपाएँ',
  'footer.tagline': 'Windows, macOS और Linux के लिए वेबसाइट ऑडिट।', 'footer.disclaimer': 'स्कोर अनुमान हैं। अहम नतीजों की खुद पुष्टि करें।',
  'error.title': 'ऑडिट पूरा नहीं हो सका',
};

const zh: Dict = {
  'nav.audit': '审计', 'nav.history': '历史', 'nav.settings': '设置',
  'hero.title': '每个细节，尽在审计。', 'hero.lead': 'SEO、hreflang、链接、性能、Cloudflare、iPhone 与内存泄漏，一处搞定。',
  'hero.placeholder': '输入网站，例如 apple.com', 'hero.button': '开始审计', 'modules.title': '包含',
  'cat.links': '链接', 'cat.website': '网站健康', 'cat.performance': '性能', 'cat.memory': '内存泄漏',
  'run.title': '正在审计', 'run.cancel': '取消', 'report.overall': '总分', 'report.exportPdf': '导出 PDF',
  'report.newAudit': '新建审计', 'report.passed': '通过', 'report.warnings': '警告', 'report.failed': '失败',
  'report.categories': '概览', 'report.duration': '用时', 'filter.all': '全部', 'filter.issues': '问题', 'filter.passed': '通过',
  'check.fix': '修复方法', 'check.more': '更多', 'history.title': '历史', 'history.empty': '你的审计记录将显示在这里。',
  'history.open': '打开', 'history.delete': '删除', 'recent.title': '最近的审计', 'settings.title': '设置',
  'settings.language': '语言', 'settings.theme': '外观', 'settings.themeSystem': '自动', 'settings.themeLight': '浅色', 'settings.themeDark': '深色',
  'settings.pages': '抓取页面数', 'settings.links': '检查链接数', 'settings.memory': '内存测试循环次数',
  'settings.device': '移动设备', 'settings.cfToken': 'Cloudflare API 令牌（可选）',
  'settings.cfHelp': '只读令牌，加密保存在系统钥匙串中。', 'settings.save': '保存', 'settings.saved': '已保存',
  'mem.clean': '未检测到泄漏', 'mem.suspicious': '可能存在泄漏', 'mem.leaking': '内存正在泄漏',
  'mem.chart': '垃圾回收后的 JS 堆', 'mem.cycle': '循环', 'mem.heap': '堆', 'mem.nodes': 'DOM 节点', 'mem.listeners': '监听器',
  'perf.vitals': '核心网页指标', 'perf.requests': '请求数', 'perf.weight': '页面大小', 'mobile.preview': '显示效果：',
  'table.show': '显示数据表', 'table.hide': '隐藏数据表',
  'footer.tagline': '适用于 Windows、macOS 和 Linux 的网站审计。', 'footer.disclaimer': '分数仅供参考，请在行动前核实关键问题。',
  'error.title': '审计未能完成',
};

const ja: Dict = {
  'nav.audit': '監査', 'nav.history': '履歴', 'nav.settings': '設定',
  'hero.title': 'すべての細部を、監査。', 'hero.lead': 'SEO、hreflang、リンク、パフォーマンス、Cloudflare、iPhone、メモリリークをひとつの場所で。',
  'hero.placeholder': 'サイトを入力（例：apple.com）', 'hero.button': '監査する', 'modules.title': '対象',
  'cat.links': 'リンク', 'cat.website': 'サイトの健全性', 'cat.performance': 'パフォーマンス', 'cat.memory': 'メモリリーク',
  'run.title': '監査中', 'run.cancel': 'キャンセル', 'report.overall': '総合スコア', 'report.exportPdf': 'PDFを書き出す',
  'report.newAudit': '新しい監査', 'report.passed': '合格', 'report.warnings': '警告', 'report.failed': '不合格',
  'report.categories': 'ひと目でわかる', 'report.duration': '所要時間', 'filter.all': 'すべて', 'filter.issues': '問題', 'filter.passed': '合格',
  'check.fix': '修正方法', 'check.more': '件以上', 'history.title': '履歴', 'history.empty': '実行した監査がここに表示されます。',
  'history.open': '開く', 'history.delete': '削除', 'recent.title': '最近の監査', 'settings.title': '設定',
  'settings.language': '言語', 'settings.theme': '外観', 'settings.themeSystem': '自動', 'settings.themeLight': 'ライト', 'settings.themeDark': 'ダーク',
  'settings.pages': 'クロールするページ数', 'settings.links': 'チェックするリンク数', 'settings.memory': 'メモリテストの回数',
  'settings.device': 'モバイルデバイス', 'settings.cfToken': 'Cloudflare APIトークン（任意）',
  'settings.cfHelp': '読み取り専用トークン。OSのキーチェーンに暗号化して保存されます。', 'settings.save': '保存', 'settings.saved': '保存しました',
  'mem.clean': 'リークは検出されませんでした', 'mem.suspicious': 'リークの可能性', 'mem.leaking': 'メモリがリークしています',
  'mem.chart': 'GC後のJSヒープ', 'mem.cycle': 'サイクル', 'mem.heap': 'ヒープ', 'mem.nodes': 'DOMノード', 'mem.listeners': 'リスナー',
  'perf.requests': 'リクエスト', 'perf.weight': 'ページサイズ', 'mobile.preview': '表示：',
  'table.show': 'データ表を表示', 'table.hide': 'データ表を隠す',
  'footer.tagline': 'Windows、macOS、Linux向けのWebサイト監査。', 'footer.disclaimer': 'スコアは目安です。重要な指摘は必ず確認してください。',
  'error.title': '監査を完了できませんでした',
};

const ko: Dict = {
  'nav.audit': '감사', 'nav.history': '기록', 'nav.settings': '설정',
  'hero.title': '모든 디테일을. 감사하다.', 'hero.lead': 'SEO, hreflang, 링크, 성능, Cloudflare, iPhone, 메모리 누수를 한곳에서.',
  'hero.placeholder': '웹사이트 입력 (예: apple.com)', 'hero.button': '감사 시작', 'modules.title': '포함 항목',
  'cat.links': '링크', 'cat.website': '사이트 상태', 'cat.performance': '성능', 'cat.memory': '메모리 누수',
  'run.title': '감사 중', 'run.cancel': '취소', 'report.overall': '종합 점수', 'report.exportPdf': 'PDF로 내보내기',
  'report.newAudit': '새 감사', 'report.passed': '통과', 'report.warnings': '경고', 'report.failed': '실패',
  'report.categories': '한눈에 보기', 'report.duration': '소요 시간', 'filter.all': '전체', 'filter.issues': '문제', 'filter.passed': '통과',
  'check.fix': '해결 방법', 'check.more': '개 더', 'history.title': '기록', 'history.empty': '실행한 감사가 여기에 표시됩니다.',
  'history.open': '열기', 'history.delete': '삭제', 'recent.title': '최근 감사', 'settings.title': '설정',
  'settings.language': '언어', 'settings.theme': '화면 모드', 'settings.themeSystem': '자동', 'settings.themeLight': '라이트', 'settings.themeDark': '다크',
  'settings.pages': '크롤링할 페이지 수', 'settings.links': '검사할 링크 수', 'settings.memory': '메모리 테스트 횟수',
  'settings.device': '모바일 기기', 'settings.cfToken': 'Cloudflare API 토큰 (선택)',
  'settings.cfHelp': '읽기 전용 토큰이며 시스템 키체인에 암호화되어 저장됩니다.', 'settings.save': '저장', 'settings.saved': '저장됨',
  'mem.clean': '누수 없음', 'mem.suspicious': '누수 가능성', 'mem.leaking': '메모리 누수 발생',
  'mem.chart': 'GC 후 JS 힙', 'mem.cycle': '사이클', 'mem.heap': '힙', 'mem.nodes': 'DOM 노드', 'mem.listeners': '리스너',
  'perf.requests': '요청 수', 'perf.weight': '페이지 크기', 'mobile.preview': '미리보기:',
  'table.show': '데이터 표 보기', 'table.hide': '데이터 표 숨기기',
  'footer.tagline': 'Windows, macOS, Linux용 웹사이트 감사.', 'footer.disclaimer': '점수는 참고용입니다. 중요한 결과는 직접 확인하세요.',
  'error.title': '감사를 완료하지 못했습니다',
};

export const LANGUAGES: { code: string; name: string; rtl?: boolean; dict: Dict }[] = [
  { code: 'en', name: 'English', dict: en },
  { code: 'es', name: 'Español', dict: es },
  { code: 'fr', name: 'Français', dict: fr },
  { code: 'de', name: 'Deutsch', dict: de },
  { code: 'pt', name: 'Português', dict: pt },
  { code: 'it', name: 'Italiano', dict: it },
  { code: 'ru', name: 'Русский', dict: ru },
  { code: 'tr', name: 'Türkçe', dict: tr },
  { code: 'ar', name: 'العربية', rtl: true, dict: ar },
  { code: 'ur', name: 'اردو', rtl: true, dict: ur },
  { code: 'hi', name: 'हिन्दी', dict: hi },
  { code: 'zh', name: '简体中文', dict: zh },
  { code: 'ja', name: '日本語', dict: ja },
  { code: 'ko', name: '한국어', dict: ko },
];

let active = LANGUAGES[0];

export function resolveLanguage(pref: string, systemLocale: string): string {
  const want = (pref === 'auto' ? systemLocale : pref).toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.some((l) => l.code === want) ? want : 'en';
}

export function setLanguage(code: string): void {
  active = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
  document.documentElement.lang = active.code;
  document.documentElement.dir = active.rtl ? 'rtl' : 'ltr';
}

export function t(key: Key): string {
  return active.dict[key] ?? EXTRA[active.code]?.[key] ?? (MORE[active.code] as Partial<Record<Key, string>> | undefined)?.[key]
    ?? (SECURITY[active.code] as Partial<Record<Key, string>> | undefined)?.[key]
    ?? (APP[active.code] as Partial<Record<Key, string>> | undefined)?.[key] ?? en[key];
}

export function currentLocale(): string { return active.code; }

/** t() with {placeholders} filled in. */
export function tf(key: Key, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
