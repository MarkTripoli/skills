package web

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

// Input decodes a browser input event: {"type":"down|move|up|wheel|text|key", ...}.
type wireInput struct {
	Type string   `json:"type"`
	X    *float32 `json:"x"`
	Y    *float32 `json:"y"`
	DY   *int     `json:"dy"`
	Text *string  `json:"text"`
	Name *string  `json:"name"`
}

// ParseInput decodes and validates a browser input event into a device input.
func ParseInput(raw []byte) (device.Input, error) {
	var w wireInput
	if err := json.Unmarshal(raw, &w); err != nil {
		return device.Input{}, err
	}
	coord := func() (float32, float32, error) {
		if w.X == nil || w.Y == nil {
			return 0, 0, fmt.Errorf("%s needs x and y", w.Type)
		}
		c := func(v float32) (float32, error) {
			if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
				return 0, errors.New("coordinate is not finite")
			}
			return min(max(v, 0), 1), nil
		}
		x, err := c(*w.X)
		if err != nil {
			return 0, 0, err
		}
		y, err := c(*w.Y)
		return x, y, err
	}
	kinds := map[string]device.InputKind{"down": device.Down, "move": device.Move, "up": device.Up}
	if k, ok := kinds[w.Type]; ok {
		x, y, err := coord()
		return device.Input{Kind: k, X: x, Y: y}, err
	}
	switch w.Type {
	case "wheel":
		x, y, err := coord()
		if err != nil {
			return device.Input{}, err
		}
		if w.DY == nil {
			return device.Input{}, errors.New("wheel needs dy")
		}
		return device.Input{Kind: device.Wheel, X: x, Y: y, DY: min(max(*w.DY, -20), 20)}, nil
	case "text":
		if w.Text == nil {
			return device.Input{}, errors.New("text needs text")
		}
		return device.Input{Kind: device.Text, Text: *w.Text}, nil
	case "key":
		if w.Name == nil {
			return device.Input{}, errors.New("key needs name")
		}
		k, ok := device.ParseKey(*w.Name)
		if !ok {
			return device.Input{}, fmt.Errorf("unknown key %s", *w.Name)
		}
		return device.Input{Kind: device.Key, Key: k}, nil
	}
	return device.Input{}, fmt.Errorf("unknown variant `%s`", w.Type)
}
