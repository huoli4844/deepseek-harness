// 本包组装独立后台进程；不包含业务规则或持久化逻辑。
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/config"
	contractapplication "starpivot.local/deepseek-harness-backend/internal/contract/application"
	contractrepository "starpivot.local/deepseek-harness-backend/internal/contract/repository"
	"starpivot.local/deepseek-harness-backend/internal/customer/application"
	"starpivot.local/deepseek-harness-backend/internal/customer/repository"
	equipmentapplication "starpivot.local/deepseek-harness-backend/internal/equipment/application"
	equipmentrepository "starpivot.local/deepseek-harness-backend/internal/equipment/repository"
	laborapplication "starpivot.local/deepseek-harness-backend/internal/labor/application"
	laborrepository "starpivot.local/deepseek-harness-backend/internal/labor/repository"
	materialapplication "starpivot.local/deepseek-harness-backend/internal/material/application"
	materialrepository "starpivot.local/deepseek-harness-backend/internal/material/repository"
	organizationapplication "starpivot.local/deepseek-harness-backend/internal/organization/application"
	organizationrepository "starpivot.local/deepseek-harness-backend/internal/organization/repository"
	"starpivot.local/deepseek-harness-backend/internal/server"
	supplierapplication "starpivot.local/deepseek-harness-backend/internal/supplier/application"
	supplierrepository "starpivot.local/deepseek-harness-backend/internal/supplier/repository"
	"starpivot.local/deepseek-harness-backend/internal/transport/httpapi"
	weeklyapplication "starpivot.local/deepseek-harness-backend/internal/weekly/application"
	weeklyrepository "starpivot.local/deepseek-harness-backend/internal/weekly/repository"
)

func main() {
	if err := run(); err != nil {
		slog.Error("后台服务退出", "error", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	settings, err := config.Load()
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", settings.Address)
	if err != nil {
		return err
	}
	defer listener.Close()

	mux := http.NewServeMux()
	httpapi.RegisterHealth(mux)
	if err := registerOrganization(mux, settings); err != nil {
		return err
	}
	closeCustomers, err := registerCustomers(ctx, listener.Addr(), mux, settings)
	if err != nil {
		return err
	}
	defer closeCustomers()
	slog.Info("后台服务已监听", "address", listener.Addr().String())
	return server.Serve(ctx, listener, mux)
}

// registerOrganization 在配置了元枢接口地址时注册组织架构查询接口。
// 组织架构数据由元枢服务维护，本服务只透传调用方凭证并做部门范围过滤。
func registerOrganization(mux *http.ServeMux, settings config.Config) error {
	if settings.IdentityAPI == "" {
		return nil
	}
	repo, err := organizationrepository.New(settings.IdentityAPI, nil)
	if err != nil {
		return err
	}
	httpapi.RegisterOrganization(mux, organizationapplication.New(repo))
	return nil
}

func registerCustomers(ctx context.Context, addr net.Addr, mux *http.ServeMux, settings config.Config) (func(), error) {
	dsn, key := settings.DatabaseURL, settings.GatewayKey
	if dsn == "" && key == "" {
		return func() {}, nil
	}
	if dsn == "" || len(key) != 32 {
		return nil, errors.New("开启客户接口需要数据库连接串和恰好 32 字节的网关密钥")
	}
	if tcp, ok := addr.(*net.TCPAddr); !ok || !tcp.IP.IsLoopback() {
		return nil, errors.New("独立模式的客户接口仅可监听本机回环地址")
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, errors.New("无法解析 PostgreSQL 连接配置")
	}
	probe, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(probe); err != nil {
		pool.Close()
		return nil, errors.New("无法连接 PostgreSQL，请检查网络和数据库配置")
	}
	trustedGateway := httpapi.NewLocalCustomerGateway([32]byte([]byte(key)))
	gateway := httpapi.WithTemporaryTenantReads(trustedGateway, settings.TemporaryReadTenantID)
	// 本人周报登记不接受临时租户身份，只接受网关身份或元枢 Bearer 凭证。
	personal := httpapi.WithBearerIdentity(trustedGateway, settings.IdentityAPI, nil)
	// 物料写入接受可信网关身份或元枢 Bearer 凭证，读取仍保留临时租户降级。
	materialAccess := httpapi.WithBearerIdentity(gateway, settings.IdentityAPI, nil)
	httpapi.RegisterCustomers(mux, application.New(repository.New(pool)), gateway)
	httpapi.RegisterSuppliers(mux, supplierapplication.New(supplierrepository.New(pool)), gateway)
	httpapi.RegisterMaterials(mux, materialapplication.New(materialrepository.New(pool)), materialAccess)
	httpapi.RegisterEquipment(mux, equipmentapplication.New(equipmentrepository.New(pool)), gateway)
	httpapi.RegisterContracts(mux, contractapplication.New(contractrepository.New(pool)), gateway)
	httpapi.RegisterLabor(mux, laborapplication.New(laborrepository.New(pool)), gateway)
	httpapi.RegisterWeeklyReports(mux, weeklyapplication.New(weeklyrepository.New(pool)), gateway)
	httpapi.RegisterWeeklyWorkspace(mux, weeklyapplication.NewWorkspace(weeklyrepository.New(pool)), personal)
	return pool.Close, nil
}
