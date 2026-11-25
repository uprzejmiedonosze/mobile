import { NewReportScreen } from '../../../../src/screens/NewReportScreen';
import { useNewReport } from '../../../../src/store/useNewReport';

// Zakładka zostaje zamontowana, więc „Zacznij od nowa” i potwierdzenie zgłoszenia zerują formularz nowym kluczem (useNewReport.restart).
export default function NewTab() {
  const formKey = useNewReport((s) => s.formKey);
  return <NewReportScreen key={formKey} />;
}
