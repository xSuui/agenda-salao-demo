import FormEntrar from "./form";

export default function Page() {
  return (
    <main className="flex flex-1 items-center justify-center bg-rose-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-rose-100">
        <h1 className="text-center text-xl font-semibold text-rose-700">
          Painel do salão
        </h1>
        <p className="mb-5 text-center text-sm text-stone-500">
          Entre para ver suas reservas
        </p>
        <FormEntrar />
      </div>
    </main>
  );
}
