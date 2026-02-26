package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	persistDirName = "outputs"
	persistMaxAge  = 1 * time.Hour
	persistMaxKeep = 20
)

// persistOutputDir returns ~/.claude/.ccg/outputs/
func persistOutputDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude", ".ccg", persistDirName)
}

// persistOutput writes content to a persistent file that survives
// Claude Code's temp file cleanup. Returns the file path on success.
func persistOutput(content, backend string) string {
	dir := persistOutputDir()
	if dir == "" {
		return ""
	}

	if err := os.MkdirAll(dir, 0o700); err != nil {
		logWarn(fmt.Sprintf("persistOutput: mkdir failed: %v", err))
		return ""
	}

	ts := time.Now().Format("20060102-150405")
	pid := os.Getpid()
	filename := fmt.Sprintf("%s-%s-%d.txt", backend, ts, pid)
	path := filepath.Join(dir, filename)

	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		logWarn(fmt.Sprintf("persistOutput: write failed: %v", err))
		return ""
	}

	logInfo(fmt.Sprintf("persistOutput: %s (%d bytes)", path, len(content)))
	return path
}

// cleanupOldPersistFiles removes files older than persistMaxAge
// and keeps at most persistMaxKeep recent files.
func cleanupOldPersistFiles() {
	dir := persistOutputDir()
	if dir == "" {
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	type finfo struct {
		path string
		mod  time.Time
	}
	var files []finfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".txt") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		files = append(files, finfo{
			path: filepath.Join(dir, e.Name()),
			mod:  info.ModTime(),
		})
	}

	sort.Slice(files, func(i, j int) bool {
		return files[i].mod.Before(files[j].mod)
	})

	now := time.Now()
	excess := len(files) - persistMaxKeep
	for i, f := range files {
		if now.Sub(f.mod) > persistMaxAge || i < excess {
			_ = os.Remove(f.path)
		}
	}
}
