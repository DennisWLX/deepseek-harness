const status = document.querySelector("#status")
const button = document.querySelector("#logs")

const query = new URLSearchParams(location.search)
if (query.get("state") === "fatal") {
  document.body.dataset.state = "fatal"
  const message = query.get("message") ?? "桌面运行时启动失败"
  status.textContent = message
} else {
  status.textContent = "正在启动"
}

button.addEventListener("click", () => {
  button.disabled = true
  if (window.__TAURI__?.core?.invoke) {
    void window.__TAURI__.core.invoke("show_log_path").finally(() => {
      button.disabled = false
    })
  }
})
