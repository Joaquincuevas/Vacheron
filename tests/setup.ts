// IndexedDB en Node para los tests de la cola offline. Cada archivo de test
// resetea la base con IDBFactory para no arrastrar estado entre casos.
import 'fake-indexeddb/auto';
