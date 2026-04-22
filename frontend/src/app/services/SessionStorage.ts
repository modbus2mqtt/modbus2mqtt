const showExpertOptionsItem = 'showExpertOptions'
export class SessionStorage {
  toggleShowExpertOptions() {
    const options = sessionStorage.getItem(showExpertOptionsItem)
    if (options) sessionStorage.removeItem(showExpertOptionsItem)
    else sessionStorage.setItem(showExpertOptionsItem, 'true')
  }
  getShowExpertOptions(): boolean {
    return sessionStorage.getItem(showExpertOptionsItem) != null
  }
}
