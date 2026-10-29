package web

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"

	"golang.org/x/image/draw"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

const (
	// MaxHeight is the tallest picture sent to the browser.
	MaxHeight   = 1280
	jpegQuality = 80
)

// EncodeJPEG encodes a frame as JPEG q80, scaled down to at most MaxHeight tall.
func EncodeJPEG(f *device.Frame) ([]byte, error) {
	img, ok := f.RGBA()
	if !ok {
		return nil, errors.New("bad frame")
	}
	var src image.Image = img
	if img.Bounds().Dy() > MaxHeight {
		w := max(img.Bounds().Dx()*MaxHeight/img.Bounds().Dy(), 1)
		dst := image.NewRGBA(image.Rect(0, 0, w, MaxHeight))
		draw.BiLinear.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Src, nil)
		src = dst
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, src, &jpeg.Options{Quality: jpegQuality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
