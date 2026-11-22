// BM-Win – program okienkowy dla Windows (WebView2).
// Cała aplikacja (folder app/) jest wbudowana w plik .exe i serwowana lokalnie
// (127.0.0.1), więc program działa bez dostępu do internetu.
// Budowanie: tools/build-exe.sh (kopiuje ../app do desktop/app i kompiluje).
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:app
var appFiles embed.FS

const appName = "BM-Win"

var version = "dev"

// Stałe porty – ten sam adres przy każdym uruchomieniu, aby przeglądarka
// zachowała pamięć lokalną (ostatnie projekty, ustawienia).
var ports = []int{47811, 47812, 47813, 47814, 47815}

func startServer() (string, error) {
	sub, err := fs.Sub(appFiles, "app")
	if err != nil {
		return "", err
	}
	h := http.FileServer(http.FS(sub))
	mux := http.NewServeMux()
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		// bez przekierowania „…/index.html → …/” (gubiłoby parametry adresu)
		if strings.HasSuffix(r.URL.Path, "/index.html") {
			r.URL.Path = strings.TrimSuffix(r.URL.Path, "index.html")
		}
		if strings.HasSuffix(r.URL.Path, ".woff2") {
			w.Header().Set("Content-Type", "font/woff2")
		}
		h.ServeHTTP(w, r)
	}))
	var ln net.Listener
	for _, p := range ports {
		ln, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			break
		}
	}
	if ln == nil {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return "", err
		}
	}
	go func() { _ = http.Serve(ln, mux) }()
	return "http://" + ln.Addr().String() + "/", nil
}

// Skrypt wstrzykiwany do każdej strony: obiekt window.bmHost (zapis/odczyt plików).
const hostJS = `(function(){
  if (window.bmHost) return;
  var seq = 0, P = {};
  window.__bmReply = function(id, res){ var p = P[id]; delete P[id]; if (!p) return; if (res && res.error) p.rej(new Error(res.error)); else p.res(res ? res.value : null); };
  function call(op, args){ return new Promise(function(res, rej){ var id = ++seq; P[id] = {res: res, rej: rej}; window.bmCall(id, op, JSON.stringify(args || {})); }); }
  window.bmHost = {
    saveFile: function(name, data, filter){ return call('save', {name: name, data: data, filter: filter || ''}); },
    openFile: function(accept){ return call('open', {accept: accept || ''}); },
    writeFile: function(path, data){ return call('write', {path: path, data: data}); },
    openPath: function(path){ return call('openPath', {path: path}); },
    version: %q
  };
})();`

type reply struct {
	Value interface{} `json:"value,omitempty"`
	Error string      `json:"error,omitempty"`
}

func replyJS(id int, r reply) string {
	b, _ := json.Marshal(r)
	return fmt.Sprintf("window.__bmReply(%d,%s)", id, string(b))
}

func dataDir() string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	d := filepath.Join(base, appName)
	_ = os.MkdirAll(d, 0o755)
	return d
}

func main() {
	url, err := startServer()
	if err != nil {
		log.Fatal(err)
	}
	run(url)
}
