/** Bindings del Worker. Los tres primeros son secretos y nunca van al repo. */
export interface Env {
  NOTION_TOKEN: string;
  NOTION_DATA_SOURCE_ID: string;
  APP_TOKEN: string;
  /** Uno o varios orígenes separados por coma. */
  ALLOWED_ORIGIN: string;
}
