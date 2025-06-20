package logger

import (
	"os"
	"time"

	"github.com/rs/zerolog"
)

var log zerolog.Logger

// Init initializes the global logger.
// If debug is true, it sets the log level to DebugLevel and uses ConsoleWriter.
// Otherwise, it sets the log level to InfoLevel and uses JSON output with Unix timestamp.
func Init(debug bool) {
	if debug {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
		consoleWriter := zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339}
		log = zerolog.New(consoleWriter).With().Timestamp().Logger()
	} else {
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
		zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
		log = zerolog.New(os.Stderr).With().Timestamp().Logger()
	}
}

// Get returns the global logger instance.
func Get() *zerolog.Logger {
	return &log
}
