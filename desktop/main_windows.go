//go:build windows

package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

var (
	comdlg32         = syscall.NewLazyDLL("comdlg32.dll")
	procGetSaveName  = comdlg32.NewProc("GetSaveFileNameW")
	procGetOpenName  = comdlg32.NewProc("GetOpenFileNameW")
	shell32          = syscall.NewLazyDLL("shell32.dll")
	procShellExecute = shell32.NewProc("ShellExecuteW")
	user32           = syscall.NewLazyDLL("user32.dll")
	procMessageBox   = user32.NewProc("MessageBoxW")
)

// OPENFILENAMEW (64-bit)
type openFileName struct {
	lStructSize       uint32
	hwndOwner         uintptr
	hInstance         uintptr
	lpstrFilter       *uint16
	lpstrCustomFilter *uint16
	nMaxCustFilter    uint32
	nFilterIndex      uint32
	lpstrFile         *uint16
	nMaxFile          uint32
	lpstrFileTitle    *uint16
	nMaxFileTitle     uint32
	lpstrInitialDir   *uint16
	lpstrTitle        *uint16
	flags             uint32
	nFileOffset       uint16
	nFileExtension    uint16
	lpstrDefExt       *uint16
	lCustData         uintptr
	lpfnHook          uintptr
	lpTemplateName    *uint16
	pvReserved        uintptr
	dwReserved        uint32
	flagsEx           uint32
}

const (
	ofnOverwritePrompt = 0x00000002
	ofnHideReadOnly    = 0x00000004
	ofnNoChangeDir     = 0x00000008
	ofnPathMustExist   = 0x00000800
	ofnFileMustExist   = 0x00001000
	ofnExplorer        = 0x00080000
)

// Filtr w postaci „Opis|*.ext;*.ext2” lub lista rozszerzeń „.bms,.json”.
func makeFilter(f string) ([]uint16, string) {
	desc, pat := "", ""
	if strings.Contains(f, "|") {
		p := strings.SplitN(f, "|", 2)
		desc, pat = p[0], p[1]
	} else if strings.TrimSpace(f) != "" {
		var pats []string
		for _, e := range strings.Split(f, ",") {
			e = strings.TrimSpace(e)
			if e == "" {
				continue
			}
			if !strings.HasPrefix(e, ".") {
				e = "." + e
			}
			pats = append(pats, "*"+e)
		}
		pat = strings.Join(pats, ";")
		desc = "Pliki (" + pat + ")"
	}
	var parts []string
	if pat != "" {
		parts = append(parts, desc, pat)
	}
	parts = append(parts, "Wszystkie pliki", "*.*")
	var u []uint16
	for _, s := range parts {
		u = append(u, syscall.StringToUTF16(s)...) // zawiera kończące 0
	}
	u = append(u, 0)
	ext := ""
	if pat != "" {
		first := strings.Split(pat, ";")[0]
		ext = strings.TrimPrefix(first, "*.")
		if ext == "*" {
			ext = ""
		}
	}
	return u, ext
}

func fileDialog(hwnd uintptr, save bool, name, filter string) (string, bool) {
	flt, ext := makeFilter(filter)
	buf := make([]uint16, 32768)
	copy(buf, syscall.StringToUTF16(name))
	var defExt *uint16
	if ext != "" {
		defExt, _ = syscall.UTF16PtrFromString(ext)
	}
	ofn := openFileName{
		hwndOwner:   hwnd,
		lpstrFilter: &flt[0],
		nFilterIndex: 1,
		lpstrFile:   &buf[0],
		nMaxFile:    uint32(len(buf)),
		lpstrDefExt: defExt,
		flags:       ofnExplorer | ofnHideReadOnly | ofnNoChangeDir | ofnPathMustExist,
	}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	var r uintptr
	if save {
		ofn.flags |= ofnOverwritePrompt
		r, _, _ = procGetSaveName.Call(uintptr(unsafe.Pointer(&ofn)))
	} else {
		ofn.flags |= ofnFileMustExist
		r, _, _ = procGetOpenName.Call(uintptr(unsafe.Pointer(&ofn)))
	}
	if r == 0 {
		return "", false
	}
	return syscall.UTF16ToString(buf), true
}

func messageBox(text string) {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(appName)
	procMessageBox.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), 0x10)
}

func run(url string) {
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  dataDir(),
		WindowOptions: webview2.WindowOptions{
			Title:  appName + " – obliczenia konstrukcji wg Eurokodów",
			Width:  1440,
			Height: 900,
			Center: true,
		},
	})
	if w == nil {
		messageBox("Nie można uruchomić komponentu Microsoft Edge WebView2.\nZainstaluj „WebView2 Runtime” ze strony Microsoft i uruchom program ponownie.")
		os.Exit(1)
	}
	defer w.Destroy()
	hwnd := uintptr(w.Window())

	w.Init(fmt.Sprintf(hostJS, version))
	_ = w.Bind("bmCall", func(id int, op string, args string) error {
		var a struct {
			Name, Data, Filter, Accept, Path string
		}
		_ = json.Unmarshal([]byte(args), &a)
		// okna dialogowe uruchamiamy po zakończeniu obsługi komunikatu WebView2
		w.Dispatch(func() {
			var r reply
			switch op {
			case "save":
				if p, ok := fileDialog(hwnd, true, a.Name, a.Filter); ok {
					data, err := base64.StdEncoding.DecodeString(a.Data)
					if err == nil {
						err = os.WriteFile(p, data, 0o644)
					}
					if err != nil {
						r.Error = err.Error()
					} else {
						r.Value = p
					}
				}
			case "open":
				if p, ok := fileDialog(hwnd, false, "", a.Accept); ok {
					data, err := os.ReadFile(p)
					if err != nil {
						r.Error = err.Error()
					} else {
						r.Value = map[string]string{"name": filepath.Base(p), "path": p, "data": base64.StdEncoding.EncodeToString(data)}
					}
				}
			case "write":
				data, err := base64.StdEncoding.DecodeString(a.Data)
				if err == nil {
					err = os.WriteFile(a.Path, data, 0o644)
				}
				if err != nil {
					r.Error = err.Error()
				} else {
					r.Value = a.Path
				}
			case "openPath":
				verb, _ := syscall.UTF16PtrFromString("open")
				file, _ := syscall.UTF16PtrFromString(a.Path)
				procShellExecute.Call(hwnd, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(file)), 0, 0, 1)
				r.Value = true
			default:
				r.Error = "nieznana operacja: " + op
			}
			w.Eval(replyJS(id, r))
		})
		return nil
	})
	w.Navigate(url + "index.html")
	w.Run()
}
