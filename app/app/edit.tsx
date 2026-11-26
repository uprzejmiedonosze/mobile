import { NewReportScreen } from '../../src/screens/NewReportScreen';
import { useNewReport } from '../../src/store/useNewReport';

// Ten sam formularz co zakładka „Nowe”, ale osobna instancja nad zakładkami: ?editId= (EDYTUJ z listy, szkic z poczekalni)
// albo ?waitingIds= (paczka z poczekalni) – wtedy nie dotyka zapamiętanego szkicu. Bez parametrów (Android, gdzie nie ma zakładki
// „Nowe”) to zwykłe nowe zgłoszenie z zapamiętanym szkicem; klucz formKey zeruje formularz po „Od nowa” i po potwierdzeniu.
export default function EditRoute() {
  const formKey = useNewReport((s) => s.formKey);
  return <NewReportScreen key={formKey} />;
}
