//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/signal"
)

// Poza Windows: lokalny serwer – aplikację otwiera się w przeglądarce.
func run(url string) {
	fmt.Printf("%s %s – otwórz w przeglądarce: %sindex.html (Ctrl+C kończy)\n", appName, version, url)
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	<-c
}
