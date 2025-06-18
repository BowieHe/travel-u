package utils

import (
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/joho/godotenv"
)

func ExpandEnvVars(input string) string {
	if !strings.Contains(input, "${") {
		return input
	}
	re := regexp.MustCompile(`\$\{([A-Z0-9_]+)\}`)
	return re.ReplaceAllStringFunc(input, func(match string) string {
		varName := re.FindStringSubmatch(match)[1]
		value, found := os.LookupEnv(varName)
		if !found {
			log.Printf("Warning: Environment variable %s not set, placeholder substituted with empty string.", varName)
			return ""
		}
		return value
	})
}

func LoadEnv() {
	err := godotenv.Load()
	if err != nil {
		log.Fatalf("failed to load env file: %v", err)
	}
}

func GetEnv(key string, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}

	return value
}
