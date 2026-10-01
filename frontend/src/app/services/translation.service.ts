import { Injectable, signal, computed } from '@angular/core'

export type Lang = 'en' | 'de' | 'fr' | 'it'

type Dict = Record<string, Record<Lang, string>>

/**
 * Lightweight UI translation helper (signal-based for zoneless Angular).
 * The application chrome (buttons, titles, tooltips, labels) is hard-coded
 * English; this service maps the keys used throughout the templates to the
 * selected language. Language is persisted in localStorage and defaults to
 * the browser locale (en/de/fr/it), falling back to English.
 */
const DICT: Dict = {
  // ---- header ----
  'header.configure': { en: 'Configure MQTT / GitHub', de: 'MQTT / GitHub konfigurieren', fr: 'Configurer MQTT / GitHub', it: 'Configura MQTT / GitHub' },
  'header.specifications': { en: 'Import / Export / Contribute specifications', de: 'Spezifikationen importieren / exportieren / beitragen', fr: 'Importer / Exporter / Contribuer aux spécifications', it: 'Importa / Esporta / Contribuisci alle specifiche' },
  'header.busses': { en: 'Show busses', de: 'Busse anzeigen', fr: 'Afficher les bus', it: 'Mostra i bus' },
  'header.language': { en: 'Language', de: 'Sprache', fr: 'Langue', it: 'Lingua' },
  'header.toggleTheme': { en: 'Toggle light / dark mode', de: 'Helles / dunkles Design umschalten', fr: 'Basculer mode clair / sombre', it: 'Cambia tema chiaro / scuro' },
  'header.logout': { en: 'Logout', de: 'Abmelden', fr: 'Se déconnecter', it: 'Esci' },
  'header.loggedInAs': { en: 'Logged in as', de: 'Angemeldet als', fr: 'Connecté en tant que', it: 'Accesso effettuato come' },

  // ---- common ----
  'common.save': { en: 'Save', de: 'Speichern', fr: 'Enregistrer', it: 'Salva' },
  'common.cancel': { en: 'Cancel', de: 'Abbrechen', fr: 'Annuler', it: 'Annulla' },
  'common.delete': { en: 'Delete', de: 'Löschen', fr: 'Supprimer', it: 'Elimina' },
  'common.add': { en: 'Add', de: 'Hinzufügen', fr: 'Ajouter', it: 'Aggiungi' },
  'common.back': { en: 'Back', de: 'Zurück', fr: 'Retour', it: 'Indietro' },
  'common.next': { en: 'Next', de: 'Weiter', fr: 'Suivant', it: 'Avanti' },
  'common.edit': { en: 'Edit', de: 'Bearbeiten', fr: 'Modifier', it: 'Modifica' },
  'common.close': { en: 'Close', de: 'Schließen', fr: 'Fermer', it: 'Chiudi' },
  'common.search': { en: 'Search', de: 'Suchen', fr: 'Rechercher', it: 'Cerca' },
  'common.status': { en: 'Status', de: 'Status', fr: 'Statut', it: 'Stato' },
  'common.name': { en: 'Name', de: 'Name', fr: 'Nom', it: 'Nome' },
  'common.type': { en: 'Type', de: 'Typ', fr: 'Type', it: 'Tipo' },
  'common.value': { en: 'Value', de: 'Wert', fr: 'Valeur', it: 'Valore' },
  'common.error': { en: 'Error', de: 'Fehler', fr: 'Erreur', it: 'Errore' },
  'common.loading': { en: 'Loading', de: 'Laden', fr: 'Chargement', it: 'Caricamento' },
  'common.connected': { en: 'Connected', de: 'Verbunden', fr: 'Connecté', it: 'Connesso' },
  'common.disconnected': { en: 'Disconnected', de: 'Getrennt', fr: 'Déconnecté', it: 'Disconnesso' },

  // ---- select-modbus ----
  'bus.listTitle': { en: 'List of Modbus Controllers', de: 'Liste der Modbus-Controller', fr: 'Liste des contrôleurs Modbus', it: 'Elenco dei controller Modbus' },
  'bus.add': { en: 'Add Modbus Controller', de: 'Modbus-Controller hinzufügen', fr: 'Ajouter un contrôleur Modbus', it: 'Aggiungi controller Modbus' },
  'bus.saveChanges': { en: 'Save Changes', de: 'Änderungen speichern', fr: 'Enregistrer les modifications', it: 'Salva le modifiche' },
  'bus.cancelChanges': { en: 'Cancel Changes', de: 'Änderungen verwerfen', fr: 'Annuler les modifications', it: 'Annulla le modifiche' },
  'bus.delete': { en: 'Delete', de: 'Löschen', fr: 'Supprimer', it: 'Elimina' },
  'bus.listSlaves': { en: 'List or Add Slaves', de: 'Slaves anzeigen oder hinzufügen', fr: 'Lister ou ajouter des esclaves', it: 'Elenca o aggiungi slave' },

  // ---- select-slave ----
  'slave.title': { en: 'List of Slaves', de: 'Liste der Slaves', fr: 'Liste des esclaves', it: 'Elenco degli slave' },
  'slave.add': { en: 'Add Slave', de: 'Slave hinzufügen', fr: 'Ajouter un esclave', it: 'Aggiungi slave' },
  'slave.id': { en: 'Slave ID', de: 'Slave-ID', fr: 'ID esclave', it: 'ID slave' },
  'slave.baudrate': { en: 'Baudrate', de: 'Baudrate', fr: 'Débit en bauds', it: 'Baudrate' },
  'slave.address': { en: 'Address', de: 'Adresse', fr: 'Adresse', it: 'Indirizzo' },

  // ---- specification ----
  'spec.title': { en: 'Specifications', de: 'Spezifikationen', fr: 'Spécifications', it: 'Specifiche' },
  'spec.import': { en: 'Import', de: 'Importieren', fr: 'Importer', it: 'Importa' },
  'spec.export': { en: 'Export', de: 'Exportieren', fr: 'Exporter', it: 'Esporta' },

  // ---- configure ----
  'configure.title': { en: 'Configuration', de: 'Konfiguration', fr: 'Configuration', it: 'Configurazione' },
  'configure.mqtt': { en: 'MQTT settings', de: 'MQTT-Einstellungen', fr: 'Paramètres MQTT', it: 'Impostazioni MQTT' },
  'configure.mqttUrl': { en: 'MQTT server URL', de: 'MQTT-Server-URL', fr: 'URL du serveur MQTT', it: 'URL del server MQTT' },
  'configure.github': { en: 'GitHub settings', de: 'GitHub-Einstellungen', fr: 'Paramètres GitHub', it: 'Impostazioni GitHub' },

  // ---- bus form labels ----
  'bus.serialDevice': { en: 'Modbus Serial Device', de: 'Modbus-Serielle Schnittstelle', fr: 'Périphérique série Modbus', it: 'Dispositivo seriale Modbus' },
  'bus.serialPort': { en: 'Serial Port', de: 'Serielle Schnittstelle', fr: 'Port série', it: 'Porta seriale' },
  'bus.baudRate': { en: 'Baud Rate', de: 'Baudrate', fr: 'Débit en bauds', it: 'Baudrate' },
  'bus.dataBits': { en: 'Data Bits', de: 'Datenbits', fr: 'Bits de données', it: 'Bit di dati' },
  'bus.parity': { en: 'Parity', de: 'Parität', fr: 'Parité', it: 'Parità' },
  'bus.stopBits': { en: 'Stop Bits', de: 'Stoppbits', fr: 'Bits d\'arrêt', it: 'Bit di stop' },
  'bus.timeout': { en: 'Timeout', de: 'Zeitüberschreitung', fr: 'Délai d\'attente', it: 'Timeout' },
  'bus.tcpBridgePort': { en: 'TCP Bridge Port', de: 'TCP-Bridge-Port', fr: 'Port pont TCP', it: 'Porta bridge TCP' },
  'bus.tcpBridgeHint': { en: 'Leave empty to disable the TCP bridge', de: 'Leer lassen, um die TCP-Bridge zu deaktivieren', fr: 'Laisser vide pour désactiver le pont TCP', it: 'Lascia vuoto per disabilitare il bridge TCP' },
  'bus.host': { en: 'Host', de: 'Host', fr: 'Hôte', it: 'Host' },
  'bus.port': { en: 'Port', de: 'Port', fr: 'Port', it: 'Porta' },
  'bus.addController': { en: 'Add Modbus Controller', de: 'Modbus-Controller hinzufügen', fr: 'Ajouter un contrôleur Modbus', it: 'Aggiungi controller Modbus' },
  'bus.rtu': { en: 'RTU', de: 'RTU', fr: 'RTU', it: 'RTU' },
  'bus.tcp': { en: 'TCP', de: 'TCP', fr: 'TCP', it: 'TCP' },

  // ---- select-slave ----
  'slave.editSpec': { en: 'Edit Specification', de: 'Spezifikation bearbeiten', fr: 'Modifier la spécification', it: 'Modifica specifica' },
  'slave.pollNow': { en: 'Poll this slave now', de: 'Diesen Slave jetzt abfragen', fr: 'Interroger cet esclave maintenant', it: 'Interroga questo slave ora' },
  'slave.fromThisOne': { en: 'Add a slave that takes its settings from this one', de: 'Slave hinzufügen, der die Einstellungen von diesem übernimmt', fr: 'Ajouter un esclave qui reprend les réglages de celui-ci', it: 'Aggiungi uno slave che eredita le impostazioni da questo' },
  'slave.addNewSpec': { en: 'Add New Specification', de: 'Neue Spezifikation hinzufügen', fr: 'Ajouter une nouvelle spécification', it: 'Aggiungi nuova specifica' },
  'slave.slaveName': { en: 'Slave Name', de: 'Slave-Name', fr: 'Nom de l\'esclave', it: 'Nome slave' },
  'slave.pollInterval': { en: 'Poll Interval [ms]', de: 'Abfrageintervall [ms]', fr: 'Intervalle d\'interrogation [ms]', it: 'Intervallo di polling [ms]' },
  'slave.pollSchedule': { en: 'Poll Schedule', de: 'Abfrageplan', fr: 'Planification d\'interrogation', it: 'Programma di polling' },
  'slave.pollMode': { en: 'Poll Mode', de: 'Abfragemodus', fr: 'Mode d\'interrogation', it: 'Modalità di polling' },
  'slave.rootTopic': { en: 'Root Topic Name', de: 'Root-Topic-Name', fr: 'Nom du sujet racine', it: 'Nome topic radice' },
  'slave.configUrl': { en: 'Configuration URL', de: 'Konfigurations-URL', fr: 'URL de configuration', it: 'URL di configurazione' },
  'slave.configUrlHint': { en: 'Use this URL inside of Home Assistant Addons (e.g. Node-RED)', de: 'Diese URL in Home-Assistant-Add-ons verwenden (z. B. Node-RED)', fr: 'Utiliser cette URL dans les add-ons Home Assistant (p. ex. Node-RED)', it: 'Usa questo URL negli add-on di Home Assistant (es. Node-RED)' },
  'slave.triggerPollTopic': { en: 'Trigger Poll Topic', de: 'Abfrage-Trigger-Topic', fr: 'Sujet de déclenchement d\'interrogation', it: 'Topic di attivazione polling' },
  'slave.statusErrors': { en: 'Status & Errors', de: 'Status & Fehler', fr: 'Statut & erreurs', it: 'Stato ed errori' },
  'slave.newSlave': { en: 'New Slave', de: 'Neuer Slave', fr: 'Nouvel esclave', it: 'Nuovo slave' },
  'slave.addSlave': { en: 'Add Modbus Slave', de: 'Modbus-Slave hinzufügen', fr: 'Ajouter un esclave Modbus', it: 'Aggiungi slave Modbus' },
  'slave.slaveId': { en: 'Slave Id', de: 'Slave-ID', fr: 'ID esclave', it: 'ID slave' },
  'slave.refHint': { en: 'Optional: take every setting from an existing slave and follow its changes. Only Slave Name, Slave Id and MQTT Root Topic stay individual.', de: 'Optional: alle Einstellungen von einem vorhandenen Slave übernehmen und dessen Änderungen folgen. Nur Slave-Name, Slave-ID und MQTT-Root-Topic bleiben individuell.', fr: 'Facultatif : reprendre tous les réglages d\'un esclave existant et suivre ses modifications. Seuls le nom, l\'ID et le sujet racine MQTT restent individuels.', it: 'Opzionale: eredita tutte le impostazioni da uno slave esistente e segui le sue modifiche. Solo nome, ID e topic MQTT radice restano individuali.' },
  'slave.slaveSettings': { en: 'Slave Settings', de: 'Slave-Einstellungen', fr: 'Réglages de l\'esclave', it: 'Impostazioni slave' },

  // ---- specifications ----
  'spec.functions': { en: 'Functions', de: 'Funktionen', fr: 'Fonctions', it: 'Funzioni' },
  'spec.importJson': { en: 'Import Specification JSON', de: 'Spezifikations-JSON importieren', fr: 'Importer le JSON de spécification', it: 'Importa JSON specifica' },
  'spec.importFiles': { en: 'Import Specification Files', de: 'Spezifikationsdateien importieren', fr: 'Importer des fichiers de spécification', it: 'Importa file di specifiche' },
  'spec.updatePublic': { en: 'Update Public Specifications', de: 'Öffentliche Spezifikationen aktualisieren', fr: 'Mettre à jour les spécifications publiques', it: 'Aggiorna specifiche pubbliche' },
  'spec.downloadLocal': { en: 'Download Local Settings', de: 'Lokale Einstellungen herunterladen', fr: 'Télécharger les réglages locaux', it: 'Scarica impostazioni locali' },
  'spec.contribute': { en: 'Contribute Specification', de: 'Spezifikation beitragen', fr: 'Contribuer à la spécification', it: 'Contribuisci alla specifica' },
  'spec.download': { en: 'Download', de: 'Herunterladen', fr: 'Télécharger', it: 'Scarica' },
  'spec.viewPr': { en: 'View Pull Request on Github', de: 'Pull-Request auf Github ansehen', fr: 'Voir la pull request sur Github', it: 'Vedi pull request su Github' },

  // ---- configure ----
  'configure.mqttTitle': { en: 'Configure MQTT', de: 'MQTT konfigurieren', fr: 'Configurer MQTT', it: 'Configura MQTT' },
  'configure.enterMqtt': { en: 'Enter MQTT Connection', de: 'MQTT-Verbindung eingeben', fr: 'Saisir la connexion MQTT', it: 'Inserisci connessione MQTT' },
  'configure.user': { en: 'User', de: 'Benutzer', fr: 'Utilisateur', it: 'Utente' },
  'configure.password': { en: 'Password', de: 'Passwort', fr: 'Mot de passe', it: 'Password' },
  'configure.caFile': { en: 'CA certificate file (located in ssl directory)', de: 'CA-Zertifikatsdatei (im ssl-Verzeichnis)', fr: 'Fichier de certificat CA (dans le répertoire ssl)', it: 'File certificato CA (nella cartella ssl)' },
  'configure.certFile': { en: 'Client certificate file (located in ssl directory)', de: 'Client-Zertifikatsdatei (im ssl-Verzeichnis)', fr: 'Fichier de certificat client (dans le répertoire ssl)', it: 'File certificato client (nella cartella ssl)' },
  'configure.keyFile': { en: 'Client key file (located in ssl directory)', de: 'Client-Schlüsseldatei (im ssl-Verzeichnis)', fr: 'Fichier de clé client (dans le répertoire ssl)', it: 'File chiave client (nella cartella ssl)' },
  'configure.githubTitle': { en: 'Configure Github', de: 'Github konfigurieren', fr: 'Configurer Github', it: 'Configura Github' },
  'configure.pat': { en: 'Personal Access Token', de: 'Persönliches Zugriffstoken', fr: 'Jeton d\'accès personnel', it: 'Token di accesso personale' },
  'configure.debugTitle': { en: 'Configure Debug', de: 'Debug konfigurieren', fr: 'Configurer le débogage', it: 'Configura debug' },
  'configure.debugComponents': { en: 'Debug components', de: 'Debug-Komponenten', fr: 'Composants de débogage', it: 'Componenti di debug' },
  'configure.debugComponentsHint': {
    en: 'Select components to log. Enables detailed logging after saving (logged to the add-on log).',
    de: 'Komponenten zum Loggen wählen. Aktiviert nach dem Speichern detaillierte Logs (im Add-on-Log).',
    fr: 'Sélectionnez les composants à journaliser. Active une journalisation détaillée après enregistrement (dans le journal de l\'add-on).',
    it: "Seleziona i componenti da registrare. Abilita log dettagliati dopo il salvataggio (nel log dell'add-on).",
  },

  // ---- select-slave (extended) ----
  'slave.showAllPublicSpecs': { en: 'Show all public specifications', de: 'Alle öffentlichen Spezifikationen anzeigen', fr: 'Afficher toutes les spécifications publiques', it: 'Mostra tutte le specifiche pubbliche' },
  'slave.mqttRootTopic': { en: 'MQTT Root Topic', de: 'MQTT-Root-Topic', fr: 'Sujet racine MQTT', it: 'Topic radice MQTT' },
  'slave.specification': { en: 'Specification', de: 'Spezifikation', fr: 'Spécification', it: 'Specifica' },
  'slave.customCron': { en: 'Custom cron', de: 'Benutzerdefinierter Cron', fr: 'Cron personnalisé', it: 'Cron personalizzato' },
  'slave.maxRegisters': { en: 'Max Registers Per Request', de: 'Max. Register pro Anfrage', fr: 'Max. registres par requête', it: 'Max registri per richiesta' },
  'slave.maxRegistersHint': { en: 'Maximum number of Modbus registers read per request (1–125). Some devices support fewer than the Modbus spec maximum of 125.', de: 'Maximale Anzahl Modbus-Register pro Anfrage (1–125). Manche Geräte unterstützen weniger als das Modbus-Maximum von 125.', fr: 'Nombre maximal de registres Modbus par requête (1–125). Certains appareils en supportent moins que le maximum Modbus de 125.', it: 'Numero massimo di registri Modbus letti per richiesta (1–125). Alcuni dispositivi ne supportano meno del massimo Modbus di 125.' },
  'slave.interval': { en: 'Interval', de: 'Intervall', fr: 'Intervalle', it: 'Intervallo' },
  'slave.intervalTrigger': { en: 'Interval and Trigger', de: 'Intervall und Trigger', fr: 'Intervalle et déclencheur', it: 'Intervallo e trigger' },
  'slave.triggerOnly': { en: 'Trigger only', de: 'Nur Trigger', fr: 'Déclencheur uniquement', it: 'Solo trigger' },
  'slave.noPolling': { en: 'No polling', de: 'Kein Polling', fr: 'Pas d\'interrogation', it: 'Nessun polling' },
  'slave.qos': { en: 'Quality of Service', de: 'Dienstgüte (QoS)', fr: 'Qualité de service', it: 'Qualità del servizio' },
  'slave.stateTopic': { en: 'State Topic', de: 'State-Topic', fr: 'Sujet d\'état', it: 'Topic di stato' },
  'slave.showRestUrl': { en: 'Show REST API Url instead of MQTT Topics', de: 'REST-API-URL statt MQTT-Topics anzeigen', fr: 'Afficher l\'URL de l\'API REST au lieu des sujets MQTT', it: 'Mostra URL API REST invece dei topic MQTT' },
  'slave.statePayloadExample': { en: 'State Payload Example', de: 'Beispiel für State-Payload', fr: 'Exemple de payload d\'état', it: 'Esempio payload di stato' },
  'slave.commandTopics': { en: 'Command Topics', de: 'Command-Topics', fr: 'Sujets de commande', it: 'Topic di comando' },
  'slave.clickToToggle': { en: 'Click to toggle', de: 'Zum Umschalten klicken', fr: 'Cliquer pour basculer', it: 'Clicca per attivare' },
  'slave.deselectExclude': { en: 'Deselect to exclude from Discovery', de: 'Abwählen, um von Discovery auszuschließen', fr: 'Désélectionner pour exclure de la découverte', it: 'Deseleziona per escludere dalla discovery' },
  'slave.bearerPat': { en: 'Bearer PAT', de: 'Bearer-PAT', fr: 'PAT porteur', it: 'Bearer PAT' },
  'slave.selectEntitiesPush': { en: 'Select entities to push', de: 'Entitäten zum Pushen auswählen', fr: 'Sélectionner les entités à pousser', it: 'Seleziona entità da inviare' },
  'slave.postBodyExample': { en: 'POST Body Example', de: 'POST-Body-Beispiel', fr: 'Exemple de corps POST', it: 'Esempio corpo POST' },
  'slave.takeSettingsFrom': { en: 'Take settings from', de: 'Einstellungen übernehmen von', fr: 'Reprendre les réglages de', it: 'Prendi impostazioni da' },
  'slave.copyToClipboard': { en: 'Copy to Clipboard', de: 'In Zwischenablage kopieren', fr: 'Copier dans le presse-papiers', it: 'Copia negli appunti' },
  'slave.subtreeHint': { en: 'Send only this subtree of the payload, e.g. \'orbis\' to post just the orbis array. Same path format as the entity MQTT name.', de: 'Nur diesen Teilbaum der Payload senden, z. B. \'orbis\', um nur das orbis-Array zu posten. Gleiches Pfadformat wie der Entity-MQTT-Name.', fr: 'N\'envoyer que cette sous-arborescence du payload, p. ex. \'orbis\' pour poster uniquement le tableau orbis. Même format de chemin que le nom MQTT de l\'entité.', it: 'Invia solo questo sottoalbero del payload, es. \'orbis\' per inviare solo l\'array orbis. Stesso formato del nome MQTT dell\'entità.' },
  'slave.storedEncrypted': { en: 'Stored encrypted. Leave empty to keep the currently stored token.', de: 'Verschlüsselt gespeichert. Leer lassen, um das aktuelle Token zu behalten.', fr: 'Stocké chiffré. Laisser vide pour conserver le jeton actuel.', it: 'Memorizzato crittografato. Lascia vuoto per mantenere il token corrente.' },
  'slave.unhideSpecs': { en: 'Unhides unmatching specifications in the specification selection list', de: 'Nicht passende Spezifikationen in der Auswahlliste einblenden', fr: 'Affiche les spécifications non correspondantes dans la liste de sélection', it: 'Mostra specifiche non corrispondenti nell\'elenco di selezione' },
  'slave.setSpecAfterAdd': { en: 'Please set the specification for the new slave after adding it', de: 'Bitte legen Sie die Spezifikation für den neuen Slave nach dem Hinzufügen fest', fr: 'Veuillez définir la spécification du nouvel esclave après l\'avoir ajouté', it: 'Imposta la specifica per il nuovo slave dopo averlo aggiunto' },
  'slave.everyDayMidnight': { en: 'Every day at midnight', de: 'Täglich um Mitternacht', fr: 'Tous les jours à minuit', it: 'Ogni giorno a mezzanotte' },

  // ---- announcement ----
  'ann.dismiss': { en: 'Dismiss', de: 'Ausblenden', fr: 'Rejeter', it: 'Ignora' },
  'ann.dismissAll': { en: 'Dismiss all announcements', de: 'Alle Hinweise ausblenden', fr: 'Rejeter toutes les annonces', it: 'Ignora tutti gli annunci' },

  // ---- modbus-error ----
  'error.queueLength': { en: 'Number of entries in the queue', de: 'Anzahl der Einträge in der Warteschlange', fr: 'Nombre d\'entrées dans la file d\'attente', it: 'Numero di voci in coda' },
  'error.processedCalls': { en: 'processed calls', de: 'verarbeitete Aufrufe', fr: 'appels traités', it: 'chiamate elaborate' },
  'error.title': { en: 'Modbus Error', de: 'Modbus-Fehler', fr: 'Erreur Modbus', it: 'Errore Modbus' },
  'error.retry': { en: 'Retry', de: 'Erneut versuchen', fr: 'Réessayer', it: 'Riprova' },
}

@Injectable({ providedIn: 'root' })
export class TranslationService {
  static readonly SUPPORTED: Lang[] = ['en', 'de', 'fr', 'it']

  /** Current language as a signal; templates bind to t() via this. */
  readonly language = signal<Lang>(this.load())

  /** Fallback-free lookup — returns the raw key if unknown. */
  t(key: string): string {
    const lang = this.language()
    const entry = DICT[key]
    if (!entry) return key
    return entry[lang] ?? entry['en'] ?? key
  }

  private load(): Lang {
    try {
      const saved = localStorage.getItem('m2m-lang') as Lang | null
      if (saved && TranslationService.SUPPORTED.includes(saved)) return saved
    } catch {
      /* ignore */
    }
    const nav = (navigator.language || 'en').replace(/-.*/g, '').toLowerCase() as Lang
    return TranslationService.SUPPORTED.includes(nav) ? nav : 'en'
  }

  setLanguage(lang: Lang): void {
    this.language.set(lang)
    try {
      localStorage.setItem('m2m-lang', lang)
    } catch {
      /* ignore */
    }
    document.documentElement.dataset['lang'] = lang
  }

  /**
   * A single reactive dictionary for the current language. Components can
   * expose `t = (k) => this.translation.map()[k] ?? k` — there is exactly
   * ONE signal dependency per component (not one per template binding), so
   * unrelated change-detection rounds (focus, input events) in the zoneless
   * engine don't re-render every translated label on the page.
   */
  readonly map = computed(() => {
    const lang = this.language()
    const out: Record<string, string> = {}
    for (const [key, vals] of Object.entries(DICT)) out[key] = vals[lang] ?? vals['en'] ?? key
    return out
  })
}
