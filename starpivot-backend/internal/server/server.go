// 本包管理 HTTP 服务生命周期，不依赖路由和业务实现。
package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"
)

// Serve 接管监听器；上下文取消后，给进行中的请求最多五秒完成。
func Serve(ctx context.Context, listener net.Listener, handler http.Handler) error {
	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	defer srv.Close()

	done := make(chan error, 1)
	go func() {
		err := srv.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		done <- err
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		shutdownErr := srv.Shutdown(shutdownCtx)
		return errors.Join(shutdownErr, <-done)
	}
}
